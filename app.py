"""
Servidor Flask: expone el juego como una API JSON y sirve el frontend.

Ejecutar:
    pip install -r requirements.txt
    python app.py
y abrir http://127.0.0.1:5000
"""

from flask import Flask, jsonify, render_template, request

from juego import Juego, JuegoError

app = Flask(__name__)
juego = None  # una sola partida en memoria


def respuesta():
    return jsonify(juego.estado())


def requiere_juego():
    if juego is None:
        raise JuegoError("Primero inicia una partida.")


@app.errorhandler(JuegoError)
def manejar_error(error):
    return jsonify({"error": str(error)}), 400


@app.get("/")
def inicio():
    return render_template("index.html")


@app.get("/api/estado")
def estado():
    if juego is None:
        return jsonify({"iniciado": False})
    juego.eventos = []
    return respuesta()


@app.post("/api/nuevo")
def nuevo():
    global juego
    datos = request.get_json(silent=True) or {}
    juego = Juego(datos.get("jugadores", []))
    return respuesta()


@app.post("/api/jugar")
def jugar():
    requiere_juego()
    datos = request.get_json(silent=True) or {}
    try:
        indice = int(datos.get("indice"))
    except (TypeError, ValueError):
        raise JuegoError("Índice de carta inválido.")
    juego.jugar(indice, datos.get("color"))
    return respuesta()


@app.post("/api/robar")
def robar():
    requiere_juego()
    juego.robar()
    return respuesta()


@app.post("/api/pasar")
def pasar():
    requiere_juego()
    juego.pasar()
    return respuesta()


@app.post("/api/auto")
def auto():
    requiere_juego()
    juego.turno_automatico()
    return respuesta()


@app.post("/api/jugadores")
def agregar_jugador():
    requiere_juego()
    datos = request.get_json(silent=True) or {}
    juego.agregar_jugador(datos.get("nombre", ""))
    return respuesta()


@app.delete("/api/jugadores/<int:id_>")
def eliminar_jugador(id_):
    requiere_juego()
    juego.eliminar_jugador(id_)
    return respuesta()


@app.get("/api/buscar")
def buscar():
    requiere_juego()
    return jsonify(juego.buscar_jugador(request.args.get("nombre", "")))


if __name__ == "__main__":
    app.run(debug=True)
