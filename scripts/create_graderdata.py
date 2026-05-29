import os
_project_root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
os.makedirs(os.path.join(_project_root, 'graderdata'), exist_ok=True)
print('OK')
