package io.github.alkarn.utils;

import io.github.alkarn.open.flashcards.dao.*;
import io.github.alkarn.open.flashcards.dao.results.*;

/**
 * Evaluates word DTO validity and quiz answers.
 * Instantiated via FlashcardConfiguration with explicit repository injection.
 */
public class EvaluatorImpl implements Evaluator {

    private final NounRepository      nounRepository;
    private final VerbRepository      verbRepository;
    private final AdjectiveRepository adjectiveRepository;
    private final AdverbRepository    adverbRepository;

    public EvaluatorImpl(NounRepository nounRepository,
                         VerbRepository verbRepository,
                         AdjectiveRepository adjectiveRepository,
                         AdverbRepository adverbRepository) {
        this.nounRepository      = nounRepository;
        this.verbRepository      = verbRepository;
        this.adjectiveRepository = adjectiveRepository;
        this.adverbRepository    = adverbRepository;
    }

    @Override
    public boolean isValid(WordDto wordDto) {
        if (wordDto == null) return false;
        return !blank(wordDto.getLiteral()) && !blank(wordDto.getTranslation());
    }

    @Override
    public String getSuccessMessage(WordDto wordDto) {
        return "\"" + wordDto.getLiteral() + "\" a \u00e9t\u00e9 ajout\u00e9 avec succ\u00e8s !";
    }

    @Override
    public String getErrorMessage(WordDto wordDto) {
        if (blank(wordDto.getLiteral()))     return "Le mot ne peut pas \u00eatre vide.";
        if (blank(wordDto.getTranslation())) return "La traduction ne peut pas \u00eatre vide.";
        return "Donn\u00e9es invalides.";
    }

    @Override
    public WordTestResult evaluateUserAnswer(WordQuestion wordQuestion) throws Exception {
        String literal = wordQuestion.getLiteral();

        if (wordQuestion instanceof NounQuestion) {
            Noun noun = nounRepository.findById(literal)
                .orElseThrow(new java.util.function.Supplier<Exception>() {
                    public Exception get() { return new Exception("Noun not found: " + literal); }
                });
            return new NounTestResult(noun, (NounQuestion) wordQuestion);

        } else if (wordQuestion instanceof VerbQuestion) {
            Verb verb = verbRepository.findById(literal)
                .orElseThrow(new java.util.function.Supplier<Exception>() {
                    public Exception get() { return new Exception("Verb not found: " + literal); }
                });
            return new VerbTestResult(verb, (VerbQuestion) wordQuestion);

        } else if (wordQuestion instanceof AdjectiveQuestion) {
            Adjective adj = adjectiveRepository.findById(literal)
                .orElseThrow(new java.util.function.Supplier<Exception>() {
                    public Exception get() { return new Exception("Adjective not found: " + literal); }
                });
            return new AdjectiveTestResult(adj, (AdjectiveQuestion) wordQuestion);

        } else if (wordQuestion instanceof AdverbQuestion) {
            Adverb adv = adverbRepository.findById(literal)
                .orElseThrow(new java.util.function.Supplier<Exception>() {
                    public Exception get() { return new Exception("Adverb not found: " + literal); }
                });
            return new AdverbTestResult(adv, (AdverbQuestion) wordQuestion);
        }

        throw new Exception("Unknown question type: " + wordQuestion.getClass().getName());
    }

    private boolean blank(String s) {
        return s == null || s.trim().isEmpty();
    }
}
