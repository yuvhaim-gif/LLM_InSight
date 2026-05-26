import ast, pathlib  
files = ['config.py','utils/file_io.py','routes/api_routes.py','routes/review_routes.py']  
for f in files:  
    try:  
        ast.parse(pathlib.Path(f).read_text(encoding='utf-8'))  
        print(f + ': OK')  
    except SyntaxError as e:  
        print(f + ': ERROR - ' + str(e))  
