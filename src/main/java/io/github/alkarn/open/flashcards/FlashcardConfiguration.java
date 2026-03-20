package io.github.alkarn.open.flashcards;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.github.alkarn.open.flashcards.dao.AdjectiveRepository;
import io.github.alkarn.open.flashcards.dao.AdverbRepository;
import io.github.alkarn.open.flashcards.dao.NounRepository;
import io.github.alkarn.open.flashcards.dao.VerbRepository;
import io.github.alkarn.open.flashcards.questioner.MongoQuestioner;
import io.github.alkarn.open.flashcards.questioner.Questioner;
import io.github.alkarn.utils.Evaluator;
import io.github.alkarn.utils.EvaluatorImpl;
import io.github.alkarn.utils.Transformer;
import io.github.alkarn.utils.TransformerImpl;

@Configuration
public class FlashcardConfiguration {

    @Autowired private NounRepository      nounRepository;
    @Autowired private VerbRepository      verbRepository;
    @Autowired private AdjectiveRepository adjectiveRepository;
    @Autowired private AdverbRepository    adverbRepository;

    @Bean
    public Evaluator evaluator() {
        return new EvaluatorImpl(nounRepository, verbRepository,
                adjectiveRepository, adverbRepository);
    }

    @Bean
    public Transformer transformer() {
        return new TransformerImpl();
    }

    /**
     * MongoQuestioner uses @Autowired internally, so we let Spring
     * manage it as a @Bean — Spring will inject its fields after construction.
     */
    @Bean
    public Questioner questioner() {
        return new MongoQuestioner();
    }
}
