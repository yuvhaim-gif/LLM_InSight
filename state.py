import threading

current_iteration_value = 1
iteration_change_event = threading.Event()
is_processing = False
models_executed = 0
_glm_model_cache = {}
_glm_load_lock = threading.Lock()
_glm_cancel_load = threading.Event()
