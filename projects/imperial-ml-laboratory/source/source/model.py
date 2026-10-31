"""Small image classifier with disjoint, reproducible public digits splits."""
import torch
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split


def build_model():
    return torch.nn.Sequential(torch.nn.Linear(64, 64), torch.nn.ReLU(), torch.nn.Linear(64, 10))


def load_splits():
    digits = load_digits()
    train_indices, remaining = train_test_split(
        list(range(len(digits.target))), test_size=0.4, random_state=42, stratify=digits.target)
    validation_indices, test_indices = train_test_split(
        remaining, test_size=0.5, random_state=43, stratify=digits.target[remaining])
    result = []
    for indices in [train_indices, validation_indices, test_indices]:
        result.extend([torch.tensor(digits.data[indices] / 16.0, dtype=torch.float32),
                       torch.tensor(digits.target[indices], dtype=torch.long)])
    return tuple(result)


def load_data():
    """Compatibility API for serving examples: training and untouched test tensors."""
    train_x, train_y, _, _, test_x, test_y = load_splits()
    return train_x, train_y, test_x, test_y
