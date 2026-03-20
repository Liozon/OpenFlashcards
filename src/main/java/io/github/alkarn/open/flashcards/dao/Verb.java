package io.github.alkarn.open.flashcards.dao;

import java.util.Map;

public class Verb extends Word {

    /** e.g. "courir", "laufen", "to run" */
    private String infinitive;

    /** pronoun → conjugated form, e.g. {"je" → "cours", "tu" → "cours"} */
    private Map<String, String> simplePresent;

    public Verb(String literal, String translation, String helpPhrase,
                String infinitive, Map<String, String> simplePresent) {
        super(literal, translation, helpPhrase);
        this.infinitive    = infinitive;
        this.simplePresent = simplePresent;
    }

    // Keep old constructor for backwards compatibility
    public Verb(String literal, String translation, String helpPhrase,
                Map<String, String> simplePresent) {
        this(literal, translation, helpPhrase, null, simplePresent);
    }

    public String getInfinitive() { return infinitive; }
    public void setInfinitive(String infinitive) { this.infinitive = infinitive; }

    public Map<String, String> getSimplePresent() { return simplePresent; }
    public void setSimplePresent(Map<String, String> simplePresent) { this.simplePresent = simplePresent; }
}
