# 
# A base class model for swapping out different programs for solving
# 

from abc import ABC, abstractmethod

class BaseScheduler(ABC):
    @abstractmethod
    def build_model():
        pass

    @abstractmethod
    def solve():
        pass