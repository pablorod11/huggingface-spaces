import unittest
from pathlib import Path
import tempfile
from scripts.refinement_experiment import NOTICE, budget, configuration, partition, recover_stories, sha, validate_output, ROOT


class RefinementTests(unittest.TestCase):
    def test_whole_story_recovery_and_checksums(self):
        stories = ["A first paragraph.\n\nA second paragraph in the same story.", "Another whole story."]
        raw = (NOTICE + "\n\n".join(stories) + "\n").encode()
        hashes = [sha(s.encode()) for s in stories]
        self.assertEqual(recover_stories(raw, hashes), stories)
        with self.assertRaises(ValueError):
            recover_stories(raw, list(reversed(hashes)))

    def test_train_subsets_are_disjoint_deterministic(self):
        stories = ["story " + str(i) for i in range(12)]
        first, second = partition(stories)
        self.assertEqual((len(first), len(second)), (9,3))
        self.assertFalse(set(first) & set(second))
        self.assertEqual((first,second), partition(list(reversed(stories))))
        with self.assertRaises(ValueError):
            partition(["duplicate"] * 12)

    def test_output_guard(self):
        for path in [ROOT / "space", ROOT / "space/new-run", ROOT / "space/new-run/nested"]:
            with self.assertRaisesRegex(ValueError, "deployed Space"):
                validate_output(path)
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, "already exists"):
                validate_output(Path(folder))
            validate_output(Path(folder) / "new-run")

    def test_bounded_configuration_and_compute(self):
        for width in (16,32):
            cfg = configuration(width, 51)
            self.assertEqual(cfg["n_embed"] % cfg["n_head"], 0)
            self.assertEqual(cfg["context_length"], 32)
        self.assertEqual(budget(40, 100), {"optimizer_tokens":10240, "approximate_training_flops_6NT":6144000})
        with self.assertRaises(ValueError):
            configuration(64, 51)
        with self.assertRaises(ValueError):
            budget(81, 100)


if __name__ == "__main__":
    unittest.main()
