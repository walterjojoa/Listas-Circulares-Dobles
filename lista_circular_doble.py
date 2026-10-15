"""
Lista Circular Doble implementada desde cero.

Cada nodo guarda un dato y dos punteros:
    - siguiente: el nodo que viene después
    - anterior:  el nodo que viene antes

Es "circular" porque el último nodo apunta al primero (cabeza) y la cabeza
apunta al último, así que la lista nunca tiene un final (no hay None).
"""


class Nodo:
    def __init__(self, dato):
        self.dato = dato
        self.siguiente = None
        self.anterior = None

    def __repr__(self):
        return f"Nodo({self.dato!r})"


class ListaCircularDoble:
    def __init__(self):
        self.cabeza = None
        self._tamano = 0

    def __len__(self):
        return self._tamano

    def esta_vacia(self):
        return self.cabeza is None

    # ------------------------------------------------------------------ #
    # Inserción
    # ------------------------------------------------------------------ #
    def insertar_al_final(self, dato):
        """Inserta un nodo entre la cola (cabeza.anterior) y la cabeza."""
        nuevo = Nodo(dato)
        if self.cabeza is None:
            # Un único nodo se apunta a sí mismo en ambos sentidos
            nuevo.siguiente = nuevo
            nuevo.anterior = nuevo
            self.cabeza = nuevo
        else:
            cola = self.cabeza.anterior
            nuevo.anterior = cola
            nuevo.siguiente = self.cabeza
            cola.siguiente = nuevo
            self.cabeza.anterior = nuevo
        self._tamano += 1
        return nuevo

    def insertar_al_inicio(self, dato):
        """Igual que insertar al final, pero el nuevo nodo pasa a ser la cabeza."""
        nuevo = self.insertar_al_final(dato)
        self.cabeza = nuevo
        return nuevo

    def insertar_despues(self, referencia, dato):
        """Inserta un nodo nuevo justo después del nodo `referencia`."""
        if referencia is None:
            return self.insertar_al_final(dato)
        nuevo = Nodo(dato)
        siguiente = referencia.siguiente
        nuevo.anterior = referencia
        nuevo.siguiente = siguiente
        referencia.siguiente = nuevo
        siguiente.anterior = nuevo
        self._tamano += 1
        return nuevo

    # ------------------------------------------------------------------ #
    # Eliminación
    # ------------------------------------------------------------------ #
    def eliminar(self, nodo):
        """
        Desconecta `nodo` de la lista y une a sus vecinos entre sí.
        Devuelve la tupla (anterior, siguiente) que quedaron enlazados,
        o (None, None) si la lista quedó vacía.
        """
        if self.cabeza is None or nodo is None:
            raise ValueError("No se puede eliminar de una lista vacía.")

        if self._tamano == 1:
            self.cabeza = None
            anterior = siguiente = None
        else:
            anterior, siguiente = nodo.anterior, nodo.siguiente
            anterior.siguiente = siguiente
            siguiente.anterior = anterior
            if nodo is self.cabeza:
                self.cabeza = siguiente

        nodo.siguiente = nodo.anterior = None
        self._tamano -= 1
        return anterior, siguiente

    # ------------------------------------------------------------------ #
    # Recorrido y búsqueda
    # ------------------------------------------------------------------ #
    def nodos(self, desde=None, sentido=1):
        """
        Recorre la lista UNA vuelta completa empezando en `desde` (o la cabeza).
        sentido = 1  -> sigue los punteros `siguiente`
        sentido = -1 -> sigue los punteros `anterior`
        """
        if self.cabeza is None:
            return
        inicio = desde or self.cabeza
        actual = inicio
        while True:
            yield actual
            actual = actual.siguiente if sentido == 1 else actual.anterior
            if actual is inicio:
                break

    def __iter__(self):
        for nodo in self.nodos():
            yield nodo.dato

    def mover(self, nodo, pasos=1, sentido=1):
        """Avanza `pasos` posiciones desde `nodo` en el sentido indicado (da la vuelta sola)."""
        for _ in range(pasos):
            nodo = nodo.siguiente if sentido == 1 else nodo.anterior
        return nodo

    def buscar(self, condicion):
        """Devuelve (nodo, recorrido) donde recorrido es la lista de nodos visitados."""
        recorrido = []
        for nodo in self.nodos():
            recorrido.append(nodo)
            if condicion(nodo.dato):
                return nodo, recorrido
        return None, recorrido

    def __repr__(self):
        datos = " <-> ".join(repr(d) for d in self)
        return f"[{datos}] (vuelve a la cabeza)" if datos else "[]"
