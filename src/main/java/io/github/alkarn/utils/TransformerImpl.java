package io.github.alkarn.utils;

import io.github.alkarn.open.flashcards.dao.*;

/**
 * Converts form DTOs into domain/persistence objects.
 * Reconstructed from original usage patterns in FlashcardController.
 */
public class TransformerImpl implements Transformer {

    @Override
    public Noun transform(NounDto dto) {
        return new Noun(
            dto.getLiteral(),
            dto.getTranslation(),
            dto.getHelpPhrase(),
            dto.getArticle() != null ? dto.getArticle() : ""
        );
    }

    @Override
    public Adverb transform(AdverbDto dto) {
        return new Adverb(
            dto.getLiteral(),
            dto.getTranslation(),
            dto.getHelpPhrase()
        );
    }

    @Override
    public Adjective transform(AdjectiveDto dto) {
        return new Adjective(
            dto.getLiteral(),
            dto.getTranslation(),
            dto.getHelpPhrase()
        );
    }

    @Override
    public Verb transform(VerbDto dto) {
        return new Verb(
            dto.getLiteral(),
            dto.getTranslation(),
            dto.getHelpPhrase(),
            dto.getSimplePresent() != null ? dto.getSimplePresent() : new java.util.HashMap<>()
        );
    }
}
