from flask import Blueprint

api_bp = Blueprint('api', __name__)
main_bp = Blueprint('main', __name__)

def register_routes(app):
    from routes import api_routes
    from routes import web_routes
    from routes import review_routes
    
    app.register_blueprint(api_bp)
    app.register_blueprint(main_bp)
