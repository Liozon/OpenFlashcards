package io.github.alkarn.utils;

import io.github.alkarn.open.flashcards.dao.*;

public interface Transformer {

    Noun      transform(NounDto dto);
    Adverb    transform(AdverbDto dto);
    Adjective transform(AdjectiveDto dto);
    Verb      transform(VerbDto dto);

}
