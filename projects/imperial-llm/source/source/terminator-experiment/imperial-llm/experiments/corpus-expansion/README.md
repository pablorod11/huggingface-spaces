# Controlled story-corpus expansion

The 4096-story candidate improves sampled character loss, but the additional benefit over equal-budget training on 512 stories is small. Generated text remains substantially ungrammatical and incoherent. **Model 004 remains live; this candidate was not published.**

## Results

On the new final test, baseline model 004 CE is **1.502947**, the 512-story continuation control is **1.454350**, and the 4096-story candidate is **1.447142** nats per normalized character.

Expansion reduces loss **3.71% relative to model 004**, but only **0.50% relative to the equal-budget control**. The control itself improves **3.23%** over model 004. More continuation training accounts for much of the observed gain at this budget; this single run does not establish that larger corpora are generally ineffective.

Expanded-corpus sampled story loss is lower on 116/128 stories versus model 004 and 75/128 versus control. One seed, a prefix-selected same-domain corpus and overlapping sampled windows do not establish statistical significance.

Validation CE: baseline **1.501926**, control **1.452199**, expanded **1.438950**. Checkpoints were selected only on validation: control step 2000; expansion step 2400. Both arms executed exactly 2400 steps and were eligible for selection at the same scheduled checks, including step 0. No tuning followed final-test evaluation.

## Controlled comparison

Both arms initialize from the identical published model 004 JSON digest `986699bbf0668f6d1aa5da67c373fe53770f7ce5e9efb3e337b5c0d7a42fe376`. Both retain 30,643 parameters, 64-character context, 51-character vocabulary, batch 16, seed 1729, constant LR 0.001, AdamW default weight decay 0.01, gradient clip 1.0 and exactly 2400 optimizer steps. Each arm uses 2,457,600 predicted training characters. Early stopping is disabled for this comparison, while best-validation checkpoint retention remains enabled. Allocated compute budget is matched; the selected checkpoint steps differ.

The expansion retains all 512 prior training stories and adds 3584 unique stories, for 4096 total and 3,340,775 normalized training characters. Validation has 128 new whole stories; final test has 128 further new stories. All 192 earlier validation/test stories are excluded from all three new groups. Whole-story training windows never cross boundaries. Exact normalized duplicates are excluded; near duplicates were not assessed. Official dataset revision, raw-prefix hashes, normalization, author attribution and license are preserved in the source archive.

The final test uses four 64-character windows per story, 32,768 predicted characters per model, seed 3703. Windows may overlap. Baseline, control and expansion are evaluated on the same windows only after validation checkpoint/arm selection. These losses cannot be compared directly with earlier published values measured on different stories/windows. The earlier final test was not rescored.

CPU training/validation runtimes: control 98.7s; expanded 111.9s. Runtime varies by host.

## Generation review and decision

All 36 continuations were inspected by one unblinded agent: four fixed prompts × three seeds × three models. Temperature 0.7; 160 new characters. No human preference score, statistical win rate or validated coherence metric is claimed.

There are occasional locally plausible phrases. For the dog prompt, the expansion at seed 1729 begins “a little bird.” It then continues “They himbird the pot out a littlest.” All 12 expanded-corpus continuations retain malformed words or broken local grammar, and the narrative frequently drifts away from the prompt. Read all paired generations in samples.json rather than inferring quality from one favorable phrase.

The objective loss gate passed, but reliable coherence improvement remains unestablished. **Keep model 004 live.** A further experiment could increase the optimization budget on the expanded corpus: its lowest validation loss occurred at the final allowed check, which suggests further optimization is worth testing, not that it will succeed. That requires a separately specified budget and a newly reserved final test. Capacity or context changes should be separate experiments so their effects can be interpreted.

## Reproduce and inspect

Extract source.zip and enter imperial-llm. The source contains unchanged model 004 in space/, old and expanded normalized corpora, the new final-test membership, both candidates, provenance and training logs. No API credentials, environments or Git history are included.

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements-story.txt
.venv/bin/python -m pytest tests/test_expanded_corpus.py tests/test_finetune_stories.py -q
.venv/bin/python scripts/compare_story_corpora.py --output experiments/corpus-reproduction-new
node experiments/corpus-reproduction-new/expanded_4096/test_inference.cjs
node experiments/corpus-reproduction-new/expanded_4096/test_generation.cjs
```

Use a new output directory. Packaged normalized data makes reproduction offline; raw-prefix downloads are unnecessary. Repeated execution reproduces already observed test results and is not a new independent holdout. The small measured legacy runtime uses Python 3.12/PyTorch 2.2.2 CPU. The broad upstream suite has previously documented compile/RMSNorm/distributed-runtime failures; focused checks do not make that suite green.

See verification.json for executed checks. Model files are in expanded_4096/ and control_512/. Dataset: modified normalized TinyStories V2 GPT-4 by Ronen Eldan and Yuanzhi Li, CDLA-Sharing-1.0 (https://cdla.dev/sharing-1-0/), revision f54c09fd23315a6f9c86f9dc80f725de7d8f9c64. Project code remains MIT licensed.
