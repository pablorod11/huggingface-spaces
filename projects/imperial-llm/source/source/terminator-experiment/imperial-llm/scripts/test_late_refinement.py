"""Release-gate controls; these never deserialize a PyTorch checkpoint."""
import math
import unittest

from late_refinement import PROMPTS, SEEDS, STEPS, promotion_gate


class ProtocolTests(unittest.TestCase):
    def test_frozen_budget_and_screen_size(self):
        self.assertEqual(STEPS, 2400)
        self.assertEqual(len(PROMPTS), 4)
        self.assertEqual(len(set(PROMPTS)), 4)
        self.assertEqual(len(SEEDS), 3)
        self.assertEqual(len(set(SEEDS)), 3)


class PromotionGateTests(unittest.TestCase):
    def gate(self, **overrides):
        values = dict(baseline_val=1.2, candidate_val=1.1,
                      baseline_test=1.3, candidate_test=1.2,
                      quality_passes=12, parity_passed=True)
        values.update(overrides)
        return promotion_gate(**values)

    def test_all_quality_samples_and_numeric_checks_pass(self):
        self.assertTrue(self.gate())

    def test_incomplete_quality_passes_block_release(self):
        for count in (0, 11):
            with self.subTest(count=count):
                self.assertFalse(self.gate(quality_passes=count))

    def test_parity_is_a_separate_required_gate(self):
        self.assertFalse(self.gate(parity_passed=False))

    def test_each_loss_requires_strict_improvement(self):
        for override in (dict(candidate_val=1.2), dict(candidate_val=1.21),
                         dict(candidate_test=1.3), dict(candidate_test=1.31)):
            with self.subTest(override=override):
                self.assertFalse(self.gate(**override))

    def test_nonfinite_losses_are_rejected(self):
        for field in ('baseline_val', 'candidate_val', 'baseline_test', 'candidate_test'):
            for value in (math.nan, math.inf, -math.inf):
                with self.subTest(field=field, value=value):
                    self.assertFalse(self.gate(**{field: value}))

    def test_negative_losses_are_rejected(self):
        for field in ('baseline_val', 'candidate_val', 'baseline_test', 'candidate_test'):
            with self.subTest(field=field):
                self.assertFalse(self.gate(**{field: -0.1}))


if __name__ == '__main__':
    unittest.main()
