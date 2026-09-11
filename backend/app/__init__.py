import os

from flask import Flask, jsonify
from flask_cors import CORS

from app.models import db


def create_app(test_config=None):
    app = Flask(__name__, instance_relative_config=True)
    os.makedirs(app.instance_path, exist_ok=True)
    app.config.from_mapping(
        SQLALCHEMY_DATABASE_URI=f"sqlite:///{os.path.join(app.instance_path, 'shared_expenses.db')}",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        ACCESS_PIN=os.environ.get("ACCESS_PIN", "48291"),
    )
    if test_config:
        app.config.update(test_config)

    db.init_app(app)
    cors_origins = os.environ.get("CORS_ORIGINS", "*")
    if cors_origins.strip() == "*":
        CORS(app, resources={r"/api/*": {"origins": "*"}})
    else:
        origins = [origin.strip() for origin in cors_origins.split(",") if origin.strip()]
        CORS(app, resources={r"/api/*": {"origins": origins}})

    from app.routes import api

    app.register_blueprint(api)

    @app.errorhandler(404)
    def not_found(_error):
        return jsonify({"error": "Resource not found."}), 404

    @app.errorhandler(500)
    def server_error(_error):
        db.session.rollback()
        return jsonify({"error": "An unexpected server error occurred."}), 500

    with app.app_context():
        db.create_all()
        if not app.config.get("TESTING"):
            from app.demo_data import ensure_demo_data

            ensure_demo_data()

    return app
