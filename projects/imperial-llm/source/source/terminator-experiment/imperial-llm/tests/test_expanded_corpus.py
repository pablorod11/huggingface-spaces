from scripts.prepare_expanded_stories import select_stories


def test_selection_drops_partial_normalized_duplicates_and_prior_evaluation():
    a='a'*129
    b='b'*129
    c='c'*129
    raw='<|endoftext|>'.join([a,a.upper(),b,c,'d'*150])
    assert select_stories(raw,list('abcd '),{b},2)==[a,c]


def test_loss_gate_rejects_expansion_that_loses_to_equal_budget_control():
    from scripts.compare_story_corpora import loss_gate
    baseline={'val':1.6,'test':1.6}
    control={'val':1.4,'test':1.4}
    assert loss_gate(baseline,control,{'val':1.3,'test':1.3})
    assert not loss_gate(baseline,control,{'val':1.5,'test':1.5})
    assert not loss_gate(baseline,control,{'val':1.3,'test':1.5})
