import ast, pathlib, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
files = ['config/__init__.py','config/settings.py','utils/file_io.py','routes/api_routes.py','routes/review_routes.py']
for f in files:
    try:
        ast.parse(pathlib.Path(f).read_text(encoding='utf-8'))
        print(f + ': OK')
    except SyntaxError as e:
        print(f + ': ERROR - ' + str(e))
