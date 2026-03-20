package io.github.alkarn.open.flashcards.api;

import java.util.Map;

public class UnifiedWordDto {
    private String type;
    private String literal;
    private String translation;
    private String helpPhrase;
    private String article;      // nouns
    private String infinitive;   // verbs
    private Map<String, String> conjugation; // verbs: pronoun -> form

    public String getType()        { return type; }
    public void setType(String v)  { this.type = v; }

    public String getLiteral()       { return literal; }
    public void setLiteral(String v) { this.literal = v; }

    public String getTranslation()       { return translation; }
    public void setTranslation(String v) { this.translation = v; }

    public String getHelpPhrase()       { return helpPhrase; }
    public void setHelpPhrase(String v) { this.helpPhrase = v; }

    public String getArticle()       { return article; }
    public void setArticle(String v) { this.article = v; }

    public String getInfinitive()       { return infinitive; }
    public void setInfinitive(String v) { this.infinitive = v; }

    public Map<String, String> getConjugation()       { return conjugation; }
    public void setConjugation(Map<String, String> v) { this.conjugation = v; }
}
