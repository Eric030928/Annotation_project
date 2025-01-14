import pandas as pd
import anthropic
import requests
import time
import json
from flask import Flask, request, jsonify, send_file, render_template, abort, Response
import os
import sys
from flask_cors import CORS
import webbrowser
import threading
import socket
from concurrent.futures import ThreadPoolExecutor, as_completed
import csv
import shutil
import atexit


# 获取应用的根目录
if getattr(sys, 'frozen', False):
    application_path = sys._MEIPASS
else:
    application_path = os.path.dirname(os.path.abspath(__file__))

# 创建临时文件夹
temp_dir = os.path.join(application_path, 'temp')
os.makedirs(temp_dir, exist_ok=True)

app = Flask(__name__, static_folder='static', template_folder='template')
CORS(app)

def get_chat_by_gpt(messages, system_prompt='', model_choice=None, app_key=None):    
    if model_choice == '1':
        # Claude模型
        client = anthropic.Anthropic(
            auth_token=app_key,
            base_url="https://aigc.sankuai.com/v1/claude/aws"
        )
        chat_completion = client.messages.create(
            model="anthropic.claude-3.5-sonnet",
            max_tokens=100000,
            system=system_prompt,
            messages=messages
        )
        return chat_completion.content[0].text
    elif model_choice == '2':
        # GPT模型
        DEFAULT_URL = "https://aigc.sankuai.com/v1/openai/native/chat/completions"
        headers = {
            'Authorization': app_key,  
            'Content-type': 'application/json',
        }
        data = {
            "model": 'gpt-4o-2024-05-13',
            "stream": "false",
            "messages": messages
        }
        data = json.dumps(data)
        data = data.encode("utf-8")
        for i in range(3):  # 重试3次
            try:
                response = requests.post(DEFAULT_URL, headers=headers, data=data)
                result = response.json()
                return result['choices'][0]['message']['content']
            except Exception as e:
                time.sleep(5)
        return "调用ChatGPT失败"
    else:
        return "无效的选择，请输入1或2"

def timeout_handler(signum, frame):
    raise TimeoutError("Processing timed out")

def process_row(row, prompt, model_choice, app_key, selected_columns, max_retries=3, timeout=60):
    for attempt in range(max_retries):
        try:
            formatted_row_data = ', '.join(f"<{col}>：{row[col]}" for col in selected_columns)
            messages = [{
                "role": "user",
                "content": f"{formatted_row_data}\n\n{prompt}"
            }]
            result = get_chat_by_gpt(messages, model_choice=model_choice, app_key=app_key)
            if result != "处理失败" and result != "调用ChatGPT失败":
                return result
        except Exception as e:
            print(f"Error processing row: {e}")  # 添加错误日志
        
        if attempt < max_retries - 1:
            time.sleep(2 ** attempt)  # 指数退避
    
    print(f"Failed to process row after {max_retries} attempts")  # 添加失败日志
    return None  # 返回 None 表示所有尝试都失败了


def annotate_csv(input_file, output_file, prompt, model_choice, app_key, selected_columns, batch_size=1000, max_workers=50):
    try:
        total_rows = len(pd.read_csv(input_file))
        
        def generate():
            start_time = time.time()
            completed_rows = 0
            skipped_rows = 0
            
            with open(output_file, 'w', newline='', encoding='utf-8') as outfile:
                writer = None
                
                for chunk in pd.read_csv(input_file, chunksize=batch_size):
                    if writer is None:
                        fieldnames = list(chunk.columns) + ['标注结果']
                        writer = csv.DictWriter(outfile, fieldnames=fieldnames)
                        writer.writeheader()
                    
                    with ThreadPoolExecutor(max_workers=max_workers) as executor:
                        futures = [executor.submit(process_row, row, prompt, model_choice, app_key, selected_columns) 
                                   for _, row in chunk.iterrows()]
                        
                        for future, (_, row) in zip(as_completed(futures), chunk.iterrows()):
                            result = future.result()
                            row_dict = row.to_dict()
                            if result is not None:
                                row_dict['标注结果'] = result
                                writer.writerow(row_dict)
                                completed_rows += 1
                            else:
                                skipped_rows += 1
                            
                            processed_rows = completed_rows + skipped_rows
                            progress = min(99, int(processed_rows / total_rows * 100))  # 最多到99%
                            elapsed_time = int(time.time() - start_time)
                            
                            yield json.dumps({
                                "progress": progress, 
                                "completed": completed_rows, 
                                "skipped": skipped_rows,
                                "total": total_rows,
                                "elapsed_time": elapsed_time,
                                "finished": False
                            }) + '\n'
                    
                    outfile.flush()  # 确保数据被写入文件

            # 所有行处理完毕后，发送100%进度
            yield json.dumps({
                "progress": 100, 
                "completed": completed_rows, 
                "skipped": skipped_rows,
                "total": total_rows,
                "elapsed_time": int(time.time() - start_time),
                "finished": True  # 只有在这里设置为True
            }) + '\n'

        return Response(generate(), mimetype='text/event-stream')

    except Exception as e:
        print(f"Error in annotate_csv: {str(e)}")  # 添加错误日志
        raise


@app.route('/analyze', methods=['POST'])
def analyze():
    try:
        file = request.files['file']
        model_choice = request.form['model_choice']
        app_key = request.form['app_key']
        prompt = request.form['prompt']
        selected_columns = json.loads(request.form['selected_columns'])

        input_file = os.path.join(temp_dir, file.filename)
        file.save(input_file)

        output_file = os.path.join(temp_dir, 'output_' + file.filename)

        return annotate_csv(input_file, output_file, prompt, model_choice=model_choice, app_key=app_key, selected_columns=selected_columns)

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/download/<filename>')
def download_file(filename):
    try:
        file_path = os.path.join(temp_dir, 'output_' + filename)
        if os.path.exists(file_path):
            return send_file(file_path, as_attachment=True, download_name='标注结果_' + filename)
        else:
            abort(404)
    except Exception as e:
        abort(500)

@app.route('/clear_data', methods=['POST'])
def clear_data():
    try:
        # 清理临时文件夹
        for filename in os.listdir(temp_dir):
            file_path = os.path.join(temp_dir, filename)
            try:
                if os.path.isfile(file_path) or os.path.islink(file_path):
                    os.unlink(file_path)
                elif os.path.isdir(file_path):
                    shutil.rmtree(file_path)
            except Exception:
                pass

        return jsonify({'status': 'success', 'message': '所有临时数据已清除'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        s.listen(1)
        port = s.getsockname()[1]
    return port

def cleanup():
    # 在应用退出时清理数据
    shutil.rmtree(temp_dir, ignore_errors=True)
    os.makedirs(temp_dir, exist_ok=True)

if __name__ == "__main__":
    port = find_free_port()
    browser_opened = False

    def open_browser_once():
        global browser_opened
        if not browser_opened:
            webbrowser.open(f'http://127.0.0.1:{port}/')
            browser_opened = True

    timer = threading.Timer(1.0, open_browser_once)
    timer.start()

    # 注册清理函数
    atexit.register(cleanup)

    # 初始清理
    cleanup()

    try:
        app.run(host='127.0.0.1', port=port, debug=False)
    finally:
        timer.cancel()
        cleanup()  # 确保在应用退出时也会清理数据
