package io.github.alkarn.open.flashcards.api;

import java.util.List;

public class QuizQuestion {
    private String wordId;
    private String wordType;
    private String literal;
    private String infinitive;
    private String helpPhrase;
    private String article;
    private List<String> choices;
    private String correctAnswer;

    public String getWordId()            { return wordId; }
    public void setWordId(String v)      { this.wordId = v; }
    public String getWordType()          { return wordType; }
    public void setWordType(String v)    { this.wordType = v; }
    public String getLiteral()           { return literal; }
    public void setLiteral(String v)     { this.literal = v; }
    public String getInfinitive()        { return infinitive; }
    public void setInfinitive(String v)  { this.infinitive = v; }
    public String getHelpPhrase()        { return helpPhrase; }
    public void setHelpPhrase(String v)  { this.helpPhrase = v; }
    public String getArticle()           { return article; }
    public void setArticle(String v)     { this.article = v; }
    public List<String> getChoices()     { return choices; }
    public void setChoices(List<String> v){ this.choices = v; }
    public String getCorrectAnswer()     { return correctAnswer; }
    public void setCorrectAnswer(String v){ this.correctAnswer = v; }
}
