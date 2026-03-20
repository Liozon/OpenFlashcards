package io.github.alkarn.utils;

import io.github.alkarn.open.flashcards.dao.WordDto;
import io.github.alkarn.open.flashcards.dao.WordQuestion;
import io.github.alkarn.open.flashcards.dao.results.WordTestResult;

public interface Evaluator {

    boolean isValid(WordDto wordDto);

    String getSuccessMessage(WordDto wordDto);

    String getErrorMessage(WordDto wordDto);

    WordTestResult evaluateUserAnswer(WordQuestion wordQuestion) throws Exception;

}
