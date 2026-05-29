import ast, pathlib, sys, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

files = [
    'ai/iterative_loop.py',
    'ai/iteration_summary.py',
    'ai/api_calls.py',
    'utils/session_keys.py',
    'utils/session.py',
    'routes/api_routes.py',
    'routes/web_routes.py',
    'main.py',
]

ok = True
for f in files:
    try:
        ast.parse(pathlib.Path(f).read_text(encoding='utf-8'))
        print(f'{f}: OK')
    except SyntaxError as e:
        print(f'{f}: SYNTAX ERROR - {e}')
        ok = False

sys.exit(0 if ok else 1)
