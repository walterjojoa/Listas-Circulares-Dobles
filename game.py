"""
Case study: turns in an UNO-style card game.

Players sit around the table in a CIRCULAR DOUBLY LINKED LIST:
    - circular: after the last player, the first one plays again.
    - doubly linked: the "Reverse" card flips the direction and the turn
      follows the `prev` pointers instead of `next`.
    - insert: a new player sits at the table in the middle of the game.
    - remove: a player who runs out of cards (or quits) leaves the list
      and their neighbours get linked to each other.
"""

import random
from collections import deque

from circular_doubly_linked_list import CircularDoublyLinkedList

COLORS = ("red", "yellow", "green", "blue")
ACTIONS = ("skip", "reverse", "+2")
WILDS = ("wild", "+4")
AVATAR_COLORS = (
    "#ff4757", "#1e90ff", "#2ed573", "#ffa502", "#a55eea",
    "#ff6b81", "#00d2d3", "#eccc68", "#5352ed", "#ff7f50",
)
VALUE_NAMES = {"skip": "Skip", "reverse": "Reverse", "wild": "Wild"}


class GameError(Exception):
    """Invalid move: the message is shown to the user."""


class Card:
    def __init__(self, color, value):
        self.color = color  # None for wild cards
        self.value = value

    @property
    def is_wild(self):
        return self.color is None

    def can_be_played_on(self, top, active_color):
        return self.is_wild or self.color == active_color or self.value == top.value

    def to_dict(self):
        return {"color": self.color, "value": self.value}

    def __str__(self):
        value = VALUE_NAMES.get(self.value, self.value)
        return value if self.is_wild else f"{self.color} {value}"


class Deck:
    def __init__(self):
        self.cards = []
        for color in COLORS:
            self.cards.append(Card(color, "0"))
            for value in [str(n) for n in range(1, 10)] + list(ACTIONS):
                self.cards += [Card(color, value), Card(color, value)]
        for value in WILDS:
            self.cards += [Card(None, value) for _ in range(4)]
        random.shuffle(self.cards)

    def draw(self, discard):
        if not self.cards:
            # Reshuffle the discard pile, keeping only the top card
            if len(discard) <= 1:
                raise GameError("There are no cards left to draw.")
            top = discard.pop()
            self.cards = discard[:]
            discard.clear()
            discard.append(top)
            random.shuffle(self.cards)
        return self.cards.pop()


class Player:
    def __init__(self, id_, name, color):
        self.id = id_
        self.name = name
        self.color = color
        self.hand = []


class Game:
    STARTING_CARDS = 7
    MIN_PLAYERS = 2
    MAX_PLAYERS = 10

    def __init__(self, names):
        names = [n.strip() for n in names if n and n.strip()]
        if len(names) < self.MIN_PLAYERS:
            raise GameError(f"At least {self.MIN_PLAYERS} players are needed.")
        if len(names) > self.MAX_PLAYERS:
            raise GameError(f"Maximum {self.MAX_PLAYERS} players.")

        self.players = CircularDoublyLinkedList()
        self.deck = Deck()
        self.discard = []
        self.direction = 1  # 1 = clockwise (next), -1 = counterclockwise (prev)
        self.current = None  # node of the player whose turn it is
        self.winners = []
        self.finished = False
        self.has_drawn = False
        self.drawn_card = None
        self.log = deque(maxlen=60)
        self.events = []
        self._next_id = 1
        self._log_count = 0

        for name in names:
            self._add(name)

        card = self._draw()
        while card.is_wild or not card.value.isdigit():
            self.deck.cards.insert(0, card)
            card = self._draw()
        self.discard.append(card)
        self.active_color = card.color
        self.current = self.players.head
        self._log("game", f"Game started with {card}. {self.current.data.name} goes first.")

    # ------------------------------------------------------------------ #
    # Internal helpers
    # ------------------------------------------------------------------ #
    def _log(self, kind, text):
        self._log_count += 1
        self.log.appendleft({"n": self._log_count, "type": kind, "text": text})

    def _event(self, kind, text, **extra):
        self.events.append({"type": kind, "text": text, **extra})

    def _new_action(self):
        self.events = []
        if self.finished:
            raise GameError("The game is over. Start a new one.")

    def _draw(self):
        return self.deck.draw(self.discard)

    def _neighbour(self, node, steps=1):
        return self.players.move(node, steps, self.direction)

    def _reset_turn(self):
        self.has_drawn = False
        self.drawn_card = None

    def _pointer_name(self):
        return "next" if self.direction == 1 else "prev"

    def _find_node(self, id_):
        node, _ = self.players.search(lambda p: p.id == id_)
        if node is None:
            raise GameError("That player is not at the table.")
        return node

    def _remove_node(self, node):
        name = node.data.name
        if node is self.current:
            self.current = self._neighbour(node)
            self._reset_turn()
        prev, following = self.players.remove(node)
        if prev is None:
            self.current = None
            self._log("list", f"remove({name}): the list is now empty.")
        elif prev is following:
            self._log("list", f"remove({name}): {prev.data.name} is left alone and points to itself.")
        else:
            self._log(
                "list",
                f"remove({name}): {prev.data.name}.next → {following.data.name} "
                f"and {following.data.name}.prev → {prev.data.name}",
            )

    def _check_game_over(self):
        if len(self.players) <= 1 and not self.finished:
            if len(self.players) == 1:
                last = self.players.head.data
                self.winners.append(last)
                if len(self.winners) == 1:
                    self._event("winner", f"{last.name} wins: they are the only one left at the table!")
            self.finished = True
            self._log("game", f"Game over. Winner: {self.winners[0].name}.")

    def _add(self, name):
        name = (name or "").strip()[:14]
        if not name:
            raise GameError("Type a name.")
        if len(self.players) >= self.MAX_PLAYERS:
            raise GameError(f"The table is full (maximum {self.MAX_PLAYERS}).")
        if any(p.name.lower() == name.lower() for p in self.players):
            raise GameError(f"There is already a player called {name}.")

        player = Player(self._next_id, name, AVATAR_COLORS[(self._next_id - 1) % len(AVATAR_COLORS)])
        self._next_id += 1
        player.hand = [self._draw() for _ in range(self.STARTING_CARDS)]

        if self.current is None:
            node = self.players.insert_at_end(player)
            operation = "insert_at_end"
        else:
            # Sits right "behind" the current player according to the direction,
            # so they play last in the current round.
            reference = self.current.prev if self.direction == 1 else self.current
            node = self.players.insert_after(reference, player)
            operation = f"insert_after({reference.data.name}, …)"

        if len(self.players) == 1:
            self._log("list", f"{operation}({name}): the list was empty, {name} is the head and points to itself.")
        else:
            prev, following = node.prev.data.name, node.next.data.name
            self._log(
                "list",
                f"{operation} {name}: {prev}.next → {name}, {name}.prev → {prev}, "
                f"{name}.next → {following}, {following}.prev → {name}",
            )
        return player

    def _best_move(self, player):
        """Simple strategy for automatic mode."""
        top = self.discard[-1]
        best, best_score = None, -1
        for i, card in enumerate(player.hand):
            if self.has_drawn and card is not self.drawn_card:
                continue
            if not card.can_be_played_on(top, self.active_color):
                continue
            if card.is_wild:
                score = 1
            elif card.value in ACTIONS:
                score = 3
            else:
                score = 2
            if score > best_score:
                best, best_score = i, score
        return best

    def _preferred_color(self, player):
        counts = {c: 0 for c in COLORS}
        for card in player.hand:
            if card.color:
                counts[card.color] += 1
        highest = max(counts.values())
        return random.choice([c for c, n in counts.items() if n == highest])

    # ------------------------------------------------------------------ #
    # Turn logic
    # ------------------------------------------------------------------ #
    def _play(self, index, color=None):
        player = self.current.data
        if not 0 <= index < len(player.hand):
            raise GameError("That card does not exist.")
        card = player.hand[index]
        top = self.discard[-1]

        if self.has_drawn and card is not self.drawn_card:
            raise GameError("After drawing you can only play the drawn card (or pass).")
        if not card.can_be_played_on(top, self.active_color):
            raise GameError(f"You can't play {card}: the active color is {self.active_color} and the top card is {top}.")
        if card.is_wild and color not in COLORS:
            raise GameError("Choose a color for the wild card.")

        player.hand.pop(index)
        self.discard.append(card)
        self.active_color = color if card.is_wild else card.color
        self._log("game", f"{player.name} played {card}.")
        self._event("play", f"{player.name} played {card}", player=player.id, card=card.to_dict())

        skips = 0
        if card.value == "reverse":
            self.direction *= -1
            direction = "clockwise" if self.direction == 1 else "counterclockwise"
            self._event("reverse", f"Reverse! The turn now goes {direction}.")
            self._log("list", f"Reverse: the turn now moves along the '{self._pointer_name()}' pointers.")
            if len(self.players) == 2:
                skips = 1  # with two players, reverse works like skip
        elif card.value == "skip":
            victim = self._neighbour(self.current).data
            self._event("skip", f"{victim.name} loses their turn!")
            skips = 1
        elif card.value in ("+2", "+4"):
            victim = self._neighbour(self.current).data
            amount = int(card.value[1])
            for _ in range(amount):
                victim.hand.append(self._draw())
            self._event("penalty", f"{victim.name} draws {amount} and loses their turn!", player=victim.id, amount=amount)
            skips = 1

        if card.is_wild:
            self._event("color", f"{player.name} chose {color}.", color=color)

        out_of_cards = not player.hand
        if out_of_cards:
            self.winners.append(player)
            self._event("winner", f"{player.name} is out of cards! Place #{len(self.winners)}")
        elif len(player.hand) == 1:
            self._event("uno", f"UNO! {player.name} has one card left.")

        previous_current = self.current
        self.current = self._neighbour(self.current, 1 + skips)
        self._reset_turn()
        if out_of_cards:
            self._remove_node(previous_current)
            self._check_game_over()

    def _draw_for_turn(self):
        if self.has_drawn:
            raise GameError("You already drew this turn: play the drawn card or pass.")
        player = self.current.data
        card = self._draw()
        player.hand.append(card)
        self.has_drawn = True
        self.drawn_card = card
        self._log("game", f"{player.name} drew a card.")
        self._event("draw", f"{player.name} drew a card", player=player.id, amount=1)
        return card

    def _pass(self):
        if not self.has_drawn:
            raise GameError("You must draw a card first.")
        player = self.current.data
        self.current = self._neighbour(self.current)
        self._reset_turn()
        self._log("game", f"{player.name} passed. {self.current.data.name}'s turn ('{self._pointer_name()}' pointer).")

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #
    def play(self, index, color=None):
        self._new_action()
        self._play(index, color)

    def draw(self):
        self._new_action()
        self._draw_for_turn()

    def pass_turn(self):
        self._new_action()
        self._pass()

    def auto_turn(self):
        self._new_action()
        player = self.current.data
        index = self._best_move(player)
        if index is None and not self.has_drawn:
            self._draw_for_turn()
            index = self._best_move(player)
        if index is None:
            self._pass()
            return
        card = player.hand[index]
        self._play(index, self._preferred_color(player) if card.is_wild else None)

    def add_player(self, name):
        self._new_action()
        player = self._add(name)
        self._event("join", f"{player.name} joined the table.", player=player.id)

    def remove_player(self, id_):
        self._new_action()
        node = self._find_node(id_)
        player = node.data
        self.deck.cards[0:0] = player.hand  # their cards go back to the bottom of the deck
        player.hand = []
        self._remove_node(node)
        self._event("leave", f"{player.name} left the game.")
        self._log("game", f"{player.name} left the game.")
        self._check_game_over()

    def search_player(self, name):
        name = (name or "").strip().lower()
        node, path = self.players.search(lambda p: p.name.lower() == name)
        return {
            "found": node is not None,
            "id": node.data.id if node else None,
            "path": [n.data.id for n in path],
        }

    def state(self):
        nodes = list(self.players.nodes())
        current_player = self.current.data if self.current else None
        upcoming = self._neighbour(self.current) if self.current and len(nodes) > 1 else None
        hand = []
        if current_player:
            top = self.discard[-1]
            for card in current_player.hand:
                playable = card.can_be_played_on(top, self.active_color)
                if self.has_drawn:
                    playable = playable and card is self.drawn_card
                hand.append({**card.to_dict(), "playable": playable and not self.finished,
                             "drawn": card is self.drawn_card})
        return {
            "started": True,
            "players": [
                {
                    "id": n.data.id,
                    "name": n.data.name,
                    "color": n.data.color,
                    "cards": len(n.data.hand),
                    "is_head": n is self.players.head,
                    "next": n.next.data.id,
                    "prev": n.prev.data.id,
                }
                for n in nodes
            ],
            "current": current_player.id if current_player else None,
            "upcoming": upcoming.data.id if upcoming else None,
            "direction": self.direction,
            "top_card": self.discard[-1].to_dict(),
            "active_color": self.active_color,
            "deck_count": len(self.deck.cards),
            "discard_count": len(self.discard),
            "hand": hand,
            "has_drawn": self.has_drawn,
            "winners": [{"id": p.id, "name": p.name, "color": p.color} for p in self.winners],
            "finished": self.finished,
            "log": list(self.log),
            "events": self.events,
        }
