"""Run the actual unittest suite and retain a machine-readable acceptance receipt."""
from pathlib import Path
import json
import unittest

ROOT = Path(__file__).resolve().parent

class RecordedResult(unittest.TextTestResult):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.records = []

    def record(self, test, status):
        name = test.id().split('.')[-1]
        self.records.append({'id': name, 'label': name.removeprefix('test_').replace('_', ' '), 'status': status})

    def addSuccess(self, test):
        super().addSuccess(test)
        self.record(test, 'pass')

    def addFailure(self, test, err):
        super().addFailure(test, err)
        self.record(test, 'fail')

    def addError(self, test, err):
        super().addError(test, err)
        self.record(test, 'error')

    def addSkip(self, test, reason):
        super().addSkip(test, reason)
        self.record(test, 'skip')

def verify():
    suite = unittest.defaultTestLoader.discover(str(ROOT), pattern='test_acceptance.py')
    result = unittest.TextTestRunner(verbosity=2, resultclass=RecordedResult).run(suite)
    receipt = {'total': result.testsRun, 'passed': sum(t['status']=='pass' for t in result.records),
               'tests': result.records}
    (ROOT / 'results/acceptance.json').write_text(json.dumps(receipt, indent=2) + '\n')
    return receipt, result.wasSuccessful()

if __name__ == '__main__':
    _, success = verify()
    raise SystemExit(0 if success else 1)
