# Controlled sentence-terminator normalization experiment

Mission: implement and test the recommended versioned corpus that preserves question/exclamation sentence-terminal symbols through the existing period token. Preserve prior artifacts, fixed vocabulary and deployment. Commander integrates; Soult owns dataset preparation/tests; Davout owns training/evaluation CLI/tests; Ney/Lannes owns independent method/code/quality review. Maximum3workers plus commander, no recursive delegation.

Treatment definition: replace raw '?' and '!' with '.' before the unchanged legacy normalizer. Preserve all other normalization, including quote-to-space handling. Reconstruct existing4096training and128validation stories by their legacy hashes against pinned cached rawsource. Preserve same source membership/order, and assign split+rawsourceSHA identities. Output aligned legacy/repaired JSON lists and provenance manifest; unchanged original files remain intact.

Train two arms, each width64/context64,110387parameters, exactsamecapacityinitialseed1729,constantLR.001,batch16,7200updates=7372800predictedtrainingcharacters. Both select by the SAME repaired-validation windows, seed3802. Disable earlystopping through thisbudget(patience37), assert executed7200, preservebestvalidation. The legacyarm's raw7200state mustexactlymatch the archivedcapacitycheckpoint; changed evaluation windows mustnotalteroptimization. Treatment stories mayretaindifferenttrailingpunctuation and lengths, affecting windowoffsetdraws as a componentofthisdatapolicy; do notclaim identicalcharacterpositionsduringtraining.

Newfinaltest:128completeofficialvalidationstories excluding960earlierevaluationstories and4096train usinglegacycanonicalhashes and originalsourceidentities. New repairedhashes alonedonot establishunseen stories. Workers read onlytrain/val documents; freezebothselectionrecords beforefinalstorycontent. Primarycomparison scoresbothmodels on identical repairedtestinputs/targets/windows, seed3803. Secondarycomparison usesidenticallegacytestwindowswithinthatrepresentation. Do not compareabsoluteCEacrossrepresentations or mixaverages. Differentendtrim/lengths maymeanwindowsdifferbetweenrepresentations.

Primarygeneration:fourpredeclaredordinaryprompts ×seeds42/1729/2026,temperature.7/top20,160newchars/model. Inspectallpairedoutputs againstpriorgrammar/coherence/degenerationcriteria beforeanyrelease. Existing28authoredsyntaxpairs mayonlyprovide reusedsecondarydiagnostics; nevergradients/checkpointselection. One seed, reusedvalidation, same-domainprefixsampling and near-duplicateuncertainty remain.

Acceptance: inputsource/corpusinitialcheckpointhashes; onlytreatmenttransformationdifference; stabletrain/val/testsourceidentity; meaningful TDD; prelaunchreview; exactlegacyreplay; executed/selectedstepaccounting; frozenmatchingprimarywindows; model/export/recordidentity and Python/JSparity; allgenerationreview; explicitcredentials-freepackage. No publicationonlossalone, and no UIchangeunlessqualityrequiresdeploymentwork. Graphifydidnotrun; familiarflow inspectedthroughsource/rg. RequestedNapoleonworkflow resolved locallyunder renamednapolean skillpath;sameinstructions apply.

Task1 complete: versionedcorpus and tests.
Task2 complete: experimentCLI and tests; methodreview.
Task3 complete: parallel7200trainingruns, freezeandscore.
Task4 complete: quality/diagnostics, integratedchecks, source/evidencepackage.

Executed:both7200stepsselected;legacyallstateexactreference. Primaryrepairedtest1.259521293→1.255961452(0.2826%lower);secondarylegacytest1.265061301→1.290351751(1.999%higher). Authoredpairs21→20;all24outputsreviewed,grammarfails12/12eacharm.37training/data+4scorercontrolspass,Nodeparity/generationpass. No publication.
