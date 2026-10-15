"""
Flask server: exposes the game as a JSON API and serves the frontend.

Run:
    pip install -r requirements.txt
    python app.py
then open http://127.0.0.1:5000
"""

from flask import Flask, jsonify, render_template, request

from game import Game, GameError

app = Flask(__name__)
game = None  # a single game kept in memory


def response():
    return jsonify(game.state())


def require_game():
    if game is None:
        raise GameError("Start a game first.")


@app.errorhandler(GameError)
def handle_error(error):
    return jsonify({"error": str(error)}), 400


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/state")
def state():
    if game is None:
        return jsonify({"started": False})
    game.events = []
    return response()


@app.post("/api/new")
def new_game():
    global game
    data = request.get_json(silent=True) or {}
    game = Game(data.get("players", []))
    return response()


@app.post("/api/play")
def play():
    require_game()
    data = request.get_json(silent=True) or {}
    try:
        index = int(data.get("index"))
    except (TypeError, ValueError):
        raise GameError("Invalid card index.")
    game.play(index, data.get("color"))
    return response()


@app.post("/api/draw")
def draw():
    require_game()
    game.draw()
    return response()


@app.post("/api/pass")
def pass_turn():
    require_game()
    game.pass_turn()
    return response()


@app.post("/api/auto")
def auto():
    require_game()
    game.auto_turn()
    return response()


@app.post("/api/players")
def add_player():
    require_game()
    data = request.get_json(silent=True) or {}
    game.add_player(data.get("name", ""))
    return response()


@app.delete("/api/players/<int:id_>")
def remove_player(id_):
    require_game()
    game.remove_player(id_)
    return response()


@app.get("/api/search")
def search():
    require_game()
    return jsonify(game.search_player(request.args.get("name", "")))


if __name__ == "__main__":
    app.run(debug=True)
