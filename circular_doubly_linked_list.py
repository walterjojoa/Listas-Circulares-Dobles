"""
Circular Doubly Linked List implemented from scratch.

Each node stores a value and two pointers:
    - next: the node that comes after it
    - prev: the node that comes before it

It is "circular" because the last node points to the first one (head) and the
head points back to the last one, so the list never has an end (no None).
"""


class Node:
    def __init__(self, data):
        self.data = data
        self.next = None
        self.prev = None

    def __repr__(self):
        return f"Node({self.data!r})"


class CircularDoublyLinkedList:
    def __init__(self):
        self.head = None
        self._size = 0

    def __len__(self):
        return self._size

    def is_empty(self):
        return self.head is None

    # ------------------------------------------------------------------ #
    # Insertion
    # ------------------------------------------------------------------ #
    def insert_at_end(self, data):
        """Inserts a node between the tail (head.prev) and the head."""
        new = Node(data)
        if self.head is None:
            # A single node points to itself in both directions
            new.next = new
            new.prev = new
            self.head = new
        else:
            tail = self.head.prev
            new.prev = tail
            new.next = self.head
            tail.next = new
            self.head.prev = new
        self._size += 1
        return new

    def insert_at_beginning(self, data):
        """Same as inserting at the end, but the new node becomes the head."""
        new = self.insert_at_end(data)
        self.head = new
        return new

    def insert_after(self, reference, data):
        """Inserts a new node right after the `reference` node."""
        if reference is None:
            return self.insert_at_end(data)
        new = Node(data)
        following = reference.next
        new.prev = reference
        new.next = following
        reference.next = new
        following.prev = new
        self._size += 1
        return new

    # ------------------------------------------------------------------ #
    # Removal
    # ------------------------------------------------------------------ #
    def remove(self, node):
        """
        Unlinks `node` from the list and connects its neighbours to each other.
        Returns the tuple (prev, next) that ended up linked,
        or (None, None) if the list became empty.
        """
        if self.head is None or node is None:
            raise ValueError("Cannot remove from an empty list.")

        if self._size == 1:
            self.head = None
            prev = following = None
        else:
            prev, following = node.prev, node.next
            prev.next = following
            following.prev = prev
            if node is self.head:
                self.head = following

        node.next = node.prev = None
        self._size -= 1
        return prev, following

    # ------------------------------------------------------------------ #
    # Traversal and search
    # ------------------------------------------------------------------ #
    def nodes(self, start=None, direction=1):
        """
        Walks ONE full lap of the list starting at `start` (or the head).
        direction = 1  -> follows the `next` pointers
        direction = -1 -> follows the `prev` pointers
        """
        if self.head is None:
            return
        first = start or self.head
        current = first
        while True:
            yield current
            current = current.next if direction == 1 else current.prev
            if current is first:
                break

    def __iter__(self):
        for node in self.nodes():
            yield node.data

    def move(self, node, steps=1, direction=1):
        """Moves `steps` positions from `node` in the given direction (wraps around)."""
        for _ in range(steps):
            node = node.next if direction == 1 else node.prev
        return node

    def search(self, condition):
        """Returns (node, path) where path is the list of visited nodes."""
        path = []
        for node in self.nodes():
            path.append(node)
            if condition(node.data):
                return node, path
        return None, path

    def __repr__(self):
        values = " <-> ".join(repr(d) for d in self)
        return f"[{values}] (back to head)" if values else "[]"
