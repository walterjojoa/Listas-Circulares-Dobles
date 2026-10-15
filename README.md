# UNO Circular — Circular Doubly Linked List Workshop

**Case study:** managing turns in a card table game (UNO style).
Players sit around a table, and each player is a **node** of a
**circular doubly linked list**.

## Why a circular doubly linked list?

| Data structure concept | Use in the game |
|---|---|
| **Circular** (the last node points to the first) | After the last player, the first one plays again, endlessly |
| **Doubly linked** (`next` and `prev` pointers) | The **Reverse** card flips the direction: the turn follows the `prev` pointers |
| **Insert node** (`insert_at_end`, `insert_after`) | A new player sits down mid-game and plays last in the round |
| **Remove node** (`remove`) | A player who runs out of cards or quits leaves, and their neighbours get linked |
| **Traverse / move** (`nodes`, `move`) | Advancing turns, the **Skip** card (2 steps) and the **+2 / +4** penalties |
| **Search** (`search`) | Finding a player by name starting from the head |

## Project structure

```
Taller_ListaCircularDoble/
├── circular_doubly_linked_list.py  # Node and CircularDoublyLinkedList classes (built from scratch)
├── game.py                         # Game rules: deck, cards, turns, effects
├── app.py                          # Flask server (JSON API + frontend)
├── templates/index.html            # User interface
├── static/css/styles.css           # Styles
├── static/js/app.js                # Animations and UI logic
└── requirements.txt
```

## How to run it

```bash
pip install -r requirements.txt
python app.py
```

Open **http://127.0.0.1:5000** in your browser.

## What the interface shows

- **The table:** each player is a node. **Pink** arrows are the `next` pointers,
  **dotted cyan** arrows are the `prev` pointers, and the **animated yellow** arrow marks the upcoming turn.
- **Center:** the deck (click to draw), the top card, and a ring that spins in the current direction
  and takes the active color.
- **Structure in memory:** the chain `A ⇄ B ⇄ C ⇄ ↺` and a table with each node's pointers.
- **List operations:** insert players, search by name (animates the traversal) and
  remove nodes (✕ button).
- **Log:** every list operation explains which pointers changed.
- **Traverse list:** highlights node by node one full lap until it gets back to the start.
- **Auto mode:** turns play themselves so you can watch the structure in motion.

## Simplified rules

- 7 cards per player. Play a card of the same **color** or the same **value**.
- **Skip:** the next player loses their turn. **Reverse:** flips the direction (with 2 players it works like Skip).
- **+2 / +4:** the next player draws and loses their turn. **Wild / +4:** you choose the color.
- If you can't play, draw a card. You may only play that drawn card; otherwise, pass.
- A player who runs out of cards leaves the list. The first one to empty their hand wins.
