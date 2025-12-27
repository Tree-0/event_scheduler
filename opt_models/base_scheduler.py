# 
# A base class model for swapping out different programs for solving
# 

from abc import ABC, abstractmethod

class BaseScheduler(ABC):
    # TODO -> fill out type hints
    # potentially need request and response structs for solver results?
    @abstractmethod
    def build_model():
        pass

    @abstractmethod
    def solve():
        pass