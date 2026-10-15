# UNO Circular — Taller de Listas Circulares Dobles

**Caso de estudio:** el control de turnos en un juego de mesa de cartas (estilo UNO).
Los jugadores están sentados alrededor de una mesa, y cada jugador es un **nodo** de una
**lista circular doble**.

## ¿Por qué una lista circular doble?

| Concepto de la estructura | Uso en el juego |
|---|---|
| **Circular** (el último apunta al primero) | Después del último jugador vuelve a jugar el primero, sin fin |
| **Doble** (punteros `siguiente` y `anterior`) | La carta **Reversa** invierte el sentido: el turno pasa a seguir los punteros `anterior` |
| **Insertar nodo** (`insertar_al_final`, `insertar_despues`) | Un jugador nuevo se sienta a mitad de partida y juega al final de la ronda |
| **Eliminar nodo** (`eliminar`) | Quien se queda sin cartas o abandona sale, y sus vecinos se enlazan entre sí |
| **Recorrer / mover** (`nodos`, `mover`) | Avanzar turnos, la carta **Salta** (2 pasos) y los castigos **+2 / +4** |
| **Buscar** (`buscar`) | Buscar un jugador por nombre empezando desde la cabeza |

## Estructura del proyecto

```
Taller_ListaCircularDoble/
├── lista_circular_doble.py   # Clases Nodo y ListaCircularDoble (hechas desde cero)
├── juego.py                  # Reglas del juego: mazo, cartas, turnos, efectos
├── app.py                    # Servidor Flask (API JSON + frontend)
├── templates/index.html      # Interfaz
├── static/css/styles.css     # Estilos
├── static/js/app.js          # Animaciones y lógica de la interfaz
└── requirements.txt
```

## Cómo ejecutarlo

```bash
pip install -r requirements.txt
python app.py
```

Abre **http://127.0.0.1:5000** en el navegador.

## Qué muestra la interfaz

- **La mesa:** cada jugador es un nodo. Las flechas **rosadas** son los punteros `siguiente`,
  las **celestes punteadas** son los punteros `anterior` y la **amarilla animada** marca el próximo turno.
- **Centro:** el mazo (clic para robar), la carta superior y un anillo que gira en el sentido actual
  y toma el color activo.
- **Estructura en memoria:** la cadena `A ⇄ B ⇄ C ⇄ ↺` y una tabla con los punteros de cada nodo.
- **Operaciones sobre la lista:** insertar jugadores, buscar por nombre (anima el recorrido) y
  eliminar nodos (botón ✕).
- **Bitácora:** cada operación de la lista explica qué punteros cambiaron.
- **Recorrer lista:** resalta nodo por nodo una vuelta completa hasta volver al inicio.
- **Modo auto:** los turnos se juegan solos para ver la estructura en movimiento.

## Reglas simplificadas

- 7 cartas por jugador. Se juega una carta del mismo **color** o del mismo **valor**.
- **Salta:** el siguiente pierde el turno. **Reversa:** cambia el sentido (con 2 jugadores actúa como Salta).
- **+2 / +4:** el siguiente roba y pierde el turno. **Comodín / +4:** eliges el color.
- Si no puedes jugar, robas una carta. Solo puedes jugar esa carta robada; si no, pasas.
- Quien se queda sin cartas sale de la lista. Gana el primero en vaciar su mano.
