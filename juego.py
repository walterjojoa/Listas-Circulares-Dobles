"""
Caso de estudio: turnos de un juego de cartas estilo UNO.

Los jugadores se sientan en una LISTA CIRCULAR DOBLE:
    - circular: después del último jugador vuelve a jugar el primero.
    - doble: la carta "Reversa" invierte el sentido y el turno pasa a
      seguir los punteros `anterior` en vez de `siguiente`.
    - insertar: un jugador nuevo se sienta en la mesa a mitad de partida.
    - eliminar: un jugador que se queda sin cartas (o abandona) sale de la
      lista y sus vecinos quedan enlazados entre sí.
"""

import random
from collections import deque

from lista_circular_doble import ListaCircularDoble

COLORES = ("rojo", "amarillo", "verde", "azul")
ACCIONES = ("salta", "reversa", "+2")
COMODINES = ("comodin", "+4")
COLORES_AVATAR = (
    "#ff4757", "#1e90ff", "#2ed573", "#ffa502", "#a55eea",
    "#ff6b81", "#00d2d3", "#eccc68", "#5352ed", "#ff7f50",
)
NOMBRE_VALOR = {"salta": "Salta", "reversa": "Reversa", "comodin": "Comodín"}


class JuegoError(Exception):
    """Jugada inválida: el mensaje se muestra al usuario."""


class Carta:
    def __init__(self, color, valor):
        self.color = color  # None para los comodines
        self.valor = valor

    @property
    def es_comodin(self):
        return self.color is None

    def puede_jugarse_sobre(self, superior, color_activo):
        return self.es_comodin or self.color == color_activo or self.valor == superior.valor

    def a_dict(self):
        return {"color": self.color, "valor": self.valor}

    def __str__(self):
        valor = NOMBRE_VALOR.get(self.valor, self.valor)
        return valor if self.es_comodin else f"{valor} {self.color}"


class Mazo:
    def __init__(self):
        self.cartas = []
        for color in COLORES:
            self.cartas.append(Carta(color, "0"))
            for valor in [str(n) for n in range(1, 10)] + list(ACCIONES):
                self.cartas += [Carta(color, valor), Carta(color, valor)]
        for valor in COMODINES:
            self.cartas += [Carta(None, valor) for _ in range(4)]
        random.shuffle(self.cartas)

    def robar(self, descarte):
        if not self.cartas:
            # Se rebaraja el descarte dejando solo la carta superior
            if len(descarte) <= 1:
                raise JuegoError("No quedan cartas para robar.")
            superior = descarte.pop()
            self.cartas = descarte[:]
            descarte.clear()
            descarte.append(superior)
            random.shuffle(self.cartas)
        return self.cartas.pop()


class Jugador:
    def __init__(self, id_, nombre, color):
        self.id = id_
        self.nombre = nombre
        self.color = color
        self.mano = []


class Juego:
    CARTAS_INICIALES = 7
    MIN_JUGADORES = 2
    MAX_JUGADORES = 10

    def __init__(self, nombres):
        nombres = [n.strip() for n in nombres if n and n.strip()]
        if len(nombres) < self.MIN_JUGADORES:
            raise JuegoError(f"Se necesitan al menos {self.MIN_JUGADORES} jugadores.")
        if len(nombres) > self.MAX_JUGADORES:
            raise JuegoError(f"Máximo {self.MAX_JUGADORES} jugadores.")

        self.lista = ListaCircularDoble()
        self.mazo = Mazo()
        self.descarte = []
        self.sentido = 1  # 1 = horario (siguiente), -1 = antihorario (anterior)
        self.actual = None  # nodo del jugador en turno
        self.ganadores = []
        self.terminado = False
        self.ya_robo = False
        self.carta_robada = None
        self.bitacora = deque(maxlen=60)
        self.eventos = []
        self._siguiente_id = 1
        self._num_log = 0

        for nombre in nombres:
            self._agregar(nombre)

        carta = self._robar()
        while carta.es_comodin or not carta.valor.isdigit():
            self.mazo.cartas.insert(0, carta)
            carta = self._robar()
        self.descarte.append(carta)
        self.color_activo = carta.color
        self.actual = self.lista.cabeza
        self._log("juego", f"Partida iniciada con {carta}. Empieza {self.actual.dato.nombre}.")

    # ------------------------------------------------------------------ #
    # Utilidades internas
    # ------------------------------------------------------------------ #
    def _log(self, tipo, texto):
        self._num_log += 1
        self.bitacora.appendleft({"n": self._num_log, "tipo": tipo, "texto": texto})

    def _evento(self, tipo, texto, **extra):
        self.eventos.append({"tipo": tipo, "texto": texto, **extra})

    def _nueva_accion(self):
        self.eventos = []
        if self.terminado:
            raise JuegoError("La partida terminó. Inicia una nueva.")

    def _robar(self):
        return self.mazo.robar(self.descarte)

    def _vecino(self, nodo, pasos=1):
        return self.lista.mover(nodo, pasos, self.sentido)

    def _reiniciar_turno(self):
        self.ya_robo = False
        self.carta_robada = None

    def _nombre_puntero(self):
        return "siguiente" if self.sentido == 1 else "anterior"

    def _buscar_nodo(self, id_):
        nodo, _ = self.lista.buscar(lambda j: j.id == id_)
        if nodo is None:
            raise JuegoError("Ese jugador no está en la mesa.")
        return nodo

    def _quitar_nodo(self, nodo):
        nombre = nodo.dato.nombre
        if nodo is self.actual:
            self.actual = self._vecino(nodo)
            self._reiniciar_turno()
        anterior, siguiente = self.lista.eliminar(nodo)
        if anterior is None:
            self.actual = None
            self._log("lista", f"eliminar({nombre}): la lista quedó vacía.")
        elif anterior is siguiente:
            self._log("lista", f"eliminar({nombre}): {anterior.dato.nombre} queda solo y se apunta a sí mismo.")
        else:
            self._log(
                "lista",
                f"eliminar({nombre}): {anterior.dato.nombre}.siguiente → {siguiente.dato.nombre} "
                f"y {siguiente.dato.nombre}.anterior → {anterior.dato.nombre}",
            )

    def _verificar_fin(self):
        if len(self.lista) <= 1 and not self.terminado:
            if len(self.lista) == 1:
                ultimo = self.lista.cabeza.dato
                self.ganadores.append(ultimo)
                if len(self.ganadores) == 1:
                    self._evento("ganador", f"¡{ultimo.nombre} gana: es el único que queda en la mesa!")
            self.terminado = True
            self._log("juego", f"Fin de la partida. Ganador: {self.ganadores[0].nombre}.")

    def _agregar(self, nombre):
        nombre = (nombre or "").strip()[:14]
        if not nombre:
            raise JuegoError("Escribe un nombre.")
        if len(self.lista) >= self.MAX_JUGADORES:
            raise JuegoError(f"La mesa está llena (máximo {self.MAX_JUGADORES}).")
        if any(j.nombre.lower() == nombre.lower() for j in self.lista):
            raise JuegoError(f"Ya hay un jugador llamado {nombre}.")

        jugador = Jugador(self._siguiente_id, nombre, COLORES_AVATAR[(self._siguiente_id - 1) % len(COLORES_AVATAR)])
        self._siguiente_id += 1
        jugador.mano = [self._robar() for _ in range(self.CARTAS_INICIALES)]

        if self.actual is None:
            nodo = self.lista.insertar_al_final(jugador)
            operacion = "insertar_al_final"
        else:
            # Se sienta justo "detrás" del jugador en turno según el sentido:
            # así juega al final de la ronda actual.
            referencia = self.actual.anterior if self.sentido == 1 else self.actual
            nodo = self.lista.insertar_despues(referencia, jugador)
            operacion = f"insertar_despues({referencia.dato.nombre}, …)"

        if len(self.lista) == 1:
            self._log("lista", f"{operacion}({nombre}): la lista estaba vacía, {nombre} es la cabeza y se apunta a sí mismo.")
        else:
            ant, sig = nodo.anterior.dato.nombre, nodo.siguiente.dato.nombre
            self._log(
                "lista",
                f"{operacion} {nombre}: {ant}.siguiente → {nombre}, {nombre}.anterior → {ant}, "
                f"{nombre}.siguiente → {sig}, {sig}.anterior → {nombre}",
            )
        return jugador

    def _mejor_jugada(self, jugador):
        """Estrategia sencilla para el modo automático."""
        superior = self.descarte[-1]
        mejor, mejor_puntaje = None, -1
        for i, carta in enumerate(jugador.mano):
            if self.ya_robo and carta is not self.carta_robada:
                continue
            if not carta.puede_jugarse_sobre(superior, self.color_activo):
                continue
            if carta.es_comodin:
                puntaje = 1
            elif carta.valor in ACCIONES:
                puntaje = 3
            else:
                puntaje = 2
            if puntaje > mejor_puntaje:
                mejor, mejor_puntaje = i, puntaje
        return mejor

    def _color_preferido(self, jugador):
        conteo = {c: 0 for c in COLORES}
        for carta in jugador.mano:
            if carta.color:
                conteo[carta.color] += 1
        maximo = max(conteo.values())
        return random.choice([c for c, n in conteo.items() if n == maximo])

    # ------------------------------------------------------------------ #
    # Lógica de turno
    # ------------------------------------------------------------------ #
    def _jugar(self, indice, color=None):
        jugador = self.actual.dato
        if not 0 <= indice < len(jugador.mano):
            raise JuegoError("Esa carta no existe.")
        carta = jugador.mano[indice]
        superior = self.descarte[-1]

        if self.ya_robo and carta is not self.carta_robada:
            raise JuegoError("Después de robar solo puedes jugar la carta robada (o pasar).")
        if not carta.puede_jugarse_sobre(superior, self.color_activo):
            raise JuegoError(f"No puedes jugar {carta}: el color activo es {self.color_activo} y la carta de arriba es {superior}.")
        if carta.es_comodin and color not in COLORES:
            raise JuegoError("Elige un color para el comodín.")

        jugador.mano.pop(indice)
        self.descarte.append(carta)
        self.color_activo = color if carta.es_comodin else carta.color
        self._log("juego", f"{jugador.nombre} jugó {carta}.")
        self._evento("jugada", f"{jugador.nombre} jugó {carta}", jugador=jugador.id, carta=carta.a_dict())

        saltos = 0
        if carta.valor == "reversa":
            self.sentido *= -1
            sentido = "horario" if self.sentido == 1 else "antihorario"
            self._evento("reversa", f"¡Reversa! Ahora el turno va en sentido {sentido}.")
            self._log("lista", f"Reversa: el turno ahora avanza por los punteros '{self._nombre_puntero()}'.")
            if len(self.lista) == 2:
                saltos = 1  # con dos jugadores la reversa funciona como "salta"
        elif carta.valor == "salta":
            victima = self._vecino(self.actual).dato
            self._evento("salta", f"¡{victima.nombre} pierde su turno!")
            saltos = 1
        elif carta.valor in ("+2", "+4"):
            victima = self._vecino(self.actual).dato
            cantidad = int(carta.valor[1])
            for _ in range(cantidad):
                victima.mano.append(self._robar())
            self._evento("castigo", f"¡{victima.nombre} roba {cantidad} y pierde el turno!", jugador=victima.id, cantidad=cantidad)
            saltos = 1

        if carta.es_comodin:
            self._evento("color", f"{jugador.nombre} eligió el color {color}.", color=color)

        termino = not jugador.mano
        if termino:
            self.ganadores.append(jugador)
            self._evento("ganador", f"¡{jugador.nombre} se quedó sin cartas! Puesto #{len(self.ganadores)}")
        elif len(jugador.mano) == 1:
            self._evento("uno", f"¡UNO! A {jugador.nombre} le queda una carta.")

        anterior_actual = self.actual
        self.actual = self._vecino(self.actual, 1 + saltos)
        self._reiniciar_turno()
        if termino:
            self._quitar_nodo(anterior_actual)
            self._verificar_fin()

    def _robar_turno(self):
        if self.ya_robo:
            raise JuegoError("Ya robaste en este turno: juega la carta robada o pasa.")
        jugador = self.actual.dato
        carta = self._robar()
        jugador.mano.append(carta)
        self.ya_robo = True
        self.carta_robada = carta
        self._log("juego", f"{jugador.nombre} robó una carta.")
        self._evento("robo", f"{jugador.nombre} robó una carta", jugador=jugador.id, cantidad=1)
        return carta

    def _pasar(self):
        if not self.ya_robo:
            raise JuegoError("Primero debes robar una carta.")
        jugador = self.actual.dato
        self.actual = self._vecino(self.actual)
        self._reiniciar_turno()
        self._log("juego", f"{jugador.nombre} pasó. Turno de {self.actual.dato.nombre} (puntero '{self._nombre_puntero()}').")

    # ------------------------------------------------------------------ #
    # API pública
    # ------------------------------------------------------------------ #
    def jugar(self, indice, color=None):
        self._nueva_accion()
        self._jugar(indice, color)

    def robar(self):
        self._nueva_accion()
        self._robar_turno()

    def pasar(self):
        self._nueva_accion()
        self._pasar()

    def turno_automatico(self):
        self._nueva_accion()
        jugador = self.actual.dato
        indice = self._mejor_jugada(jugador)
        if indice is None and not self.ya_robo:
            self._robar_turno()
            indice = self._mejor_jugada(jugador)
        if indice is None:
            self._pasar()
            return
        carta = jugador.mano[indice]
        self._jugar(indice, self._color_preferido(jugador) if carta.es_comodin else None)

    def agregar_jugador(self, nombre):
        self._nueva_accion()
        jugador = self._agregar(nombre)
        self._evento("entra", f"{jugador.nombre} se sentó en la mesa.", jugador=jugador.id)

    def eliminar_jugador(self, id_):
        self._nueva_accion()
        nodo = self._buscar_nodo(id_)
        jugador = nodo.dato
        self.mazo.cartas[0:0] = jugador.mano  # sus cartas vuelven al fondo del mazo
        jugador.mano = []
        self._quitar_nodo(nodo)
        self._evento("sale", f"{jugador.nombre} abandonó la partida.")
        self._log("juego", f"{jugador.nombre} abandonó la partida.")
        self._verificar_fin()

    def buscar_jugador(self, nombre):
        nombre = (nombre or "").strip().lower()
        nodo, recorrido = self.lista.buscar(lambda j: j.nombre.lower() == nombre)
        return {
            "encontrado": nodo is not None,
            "id": nodo.dato.id if nodo else None,
            "recorrido": [n.dato.id for n in recorrido],
        }

    def estado(self):
        nodos = list(self.lista.nodos())
        jugador_actual = self.actual.dato if self.actual else None
        proximo = self._vecino(self.actual) if self.actual and len(nodos) > 1 else None
        mano = []
        if jugador_actual:
            superior = self.descarte[-1]
            for carta in jugador_actual.mano:
                jugable = carta.puede_jugarse_sobre(superior, self.color_activo)
                if self.ya_robo:
                    jugable = jugable and carta is self.carta_robada
                mano.append({**carta.a_dict(), "jugable": jugable and not self.terminado,
                             "robada": carta is self.carta_robada})
        return {
            "iniciado": True,
            "jugadores": [
                {
                    "id": n.dato.id,
                    "nombre": n.dato.nombre,
                    "color": n.dato.color,
                    "cartas": len(n.dato.mano),
                    "es_cabeza": n is self.lista.cabeza,
                    "siguiente": n.siguiente.dato.id,
                    "anterior": n.anterior.dato.id,
                }
                for n in nodos
            ],
            "actual": jugador_actual.id if jugador_actual else None,
            "proximo": proximo.dato.id if proximo else None,
            "sentido": self.sentido,
            "carta_superior": self.descarte[-1].a_dict(),
            "color_activo": self.color_activo,
            "cartas_mazo": len(self.mazo.cartas),
            "cartas_descarte": len(self.descarte),
            "mano": mano,
            "ya_robo": self.ya_robo,
            "ganadores": [{"id": j.id, "nombre": j.nombre, "color": j.color} for j in self.ganadores],
            "terminado": self.terminado,
            "bitacora": list(self.bitacora),
            "eventos": self.eventos,
        }
