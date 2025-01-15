# Annotation_project
## Background
When it comes to analyzing a large amount of unstructured data to draw conclusions, reading the file content line by line is both time-consuming and laborious, and the operation is quite difficult. However, with this platform, you can easily start the process of having a large language model (LLM) assist you in completing the task. Specifically, the model can analyze a large amount of data in the file and label it according to your instructions.
## How to run it?
Download it;
Make sure you have downloaded all the modules in app.py;
Then open terminal and enter these:
``` Python 
cd Annotation_project
Python app.py
```
## What do you need to start it?
1. API key to start the LLM model

## Tutorials
1. After you started it successfully, it should occur the website after a few seconds like this:![image](Readme_figure/File_tree.png)
2. Then, choose the model that you would like to use; Remember in this step you should change the interface of the model in app.py, or you may not know how to start it
3. Then, enter the api key of the model that you used
4. Upload the files by clicking the blue button below and choosing the .csv file
5. Then the application will automatically read the column's name of each row, which looks like this: 
	Thus, you can choose the columns that you need to upload to let the LLM know
6. It turns to write the prompt, which is essential, but I won't tell how to write prompt here, you can find it in other ways; 
7. Then, click the button below to start it, and you will see the process instantly:
8. After the annotation is done, you will see a toast like below, and click "close" it will automatically start to download in your computer:

