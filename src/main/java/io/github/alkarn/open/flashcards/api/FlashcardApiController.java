package io.github.alkarn.open.flashcards.api;

import io.github.alkarn.open.flashcards.dao.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api")
public class FlashcardApiController {

    @Autowired private NounRepository      nounRepository;
    @Autowired private AdverbRepository    adverbRepository;
    @Autowired private AdjectiveRepository adjectiveRepository;
    @Autowired private VerbRepository      verbRepository;

    // ── ADD WORD ──────────────────────────────────────────────────────────────

    @PostMapping("/words")
    public ResponseEntity<Map<String, String>> addWord(@RequestBody UnifiedWordDto dto) {
        if (blank(dto.getLiteral()) || blank(dto.getTranslation()) || blank(dto.getType())) {
            return ResponseEntity.badRequest().body(strMap("error",
                "Le mot, la traduction et le type sont obligatoires."));
        }

        String type = dto.getType().toLowerCase();
        switch (type) {
            case "noun":
                nounRepository.save(new Noun(
                    dto.getLiteral(), dto.getTranslation(), dto.getHelpPhrase(),
                    dto.getArticle() != null ? dto.getArticle() : ""));
                break;
            case "verb":
                Map<String, String> conj = dto.getConjugation() != null
                    ? dto.getConjugation() : new HashMap<String, String>();
                verbRepository.save(new Verb(
                    dto.getLiteral(), dto.getTranslation(), dto.getHelpPhrase(),
                    dto.getInfinitive() != null ? dto.getInfinitive() : "",
                    conj));
                break;
            case "adjective":
                adjectiveRepository.save(new Adjective(
                    dto.getLiteral(), dto.getTranslation(), dto.getHelpPhrase()));
                break;
            case "adverb":
                adverbRepository.save(new Adverb(
                    dto.getLiteral(), dto.getTranslation(), dto.getHelpPhrase()));
                break;
            default:
                return ResponseEntity.badRequest().body(strMap("error", "Type inconnu : " + dto.getType()));
        }

        return ResponseEntity.ok(strMap("message",
            "\u2713 \"" + dto.getLiteral() + "\" ajout\u00e9 avec succ\u00e8s !"));
    }

    // ── LIST ALL WORDS ────────────────────────────────────────────────────────

    @GetMapping("/words")
    public ResponseEntity<List<Map<String, Object>>> listAll() {
        List<Map<String, Object>> words = new ArrayList<>();
        for (Noun      w : nounRepository.findAll())       words.add(wordToMap(w, "noun"));
        for (Verb      w : verbRepository.findAll())       words.add(wordToMap(w, "verb"));
        for (Adjective w : adjectiveRepository.findAll())  words.add(wordToMap(w, "adjective"));
        for (Adverb    w : adverbRepository.findAll())     words.add(wordToMap(w, "adverb"));
        return ResponseEntity.ok(words);
    }

    // ── TRAINING: GET QUIZ QUESTION ───────────────────────────────────────────

    @GetMapping("/quiz")
    public ResponseEntity<?> getQuizQuestion(@RequestParam(required = false) String type) {
        List<Word> allWords = new ArrayList<>();
        if (type == null || "noun".equals(type))      for (Noun      w : nounRepository.findAll())       allWords.add(w);
        if (type == null || "verb".equals(type))      for (Verb      w : verbRepository.findAll())       allWords.add(w);
        if (type == null || "adjective".equals(type)) for (Adjective w : adjectiveRepository.findAll())  allWords.add(w);
        if (type == null || "adverb".equals(type))    for (Adverb    w : adverbRepository.findAll())     allWords.add(w);

        if (allWords.size() < 2) {
            return ResponseEntity.badRequest().body(strMap("error",
                "Ajoutez au moins 2 mots pour commencer l'entra\u00eenement !"));
        }

        Collections.shuffle(allWords);
        Word question = allWords.get(0);

        // Build 3 unique decoy translations
        List<String> decoys = new ArrayList<>();
        for (Word w : allWords) {
            if (!w.getTranslation().equals(question.getTranslation())
                    && !decoys.contains(w.getTranslation())) {
                decoys.add(w.getTranslation());
                if (decoys.size() == 3) break;
            }
        }

        List<String> choices = new ArrayList<>(decoys);
        choices.add(question.getTranslation());
        Collections.shuffle(choices);

        String wordType = "word";
        if      (question instanceof Noun)      wordType = "noun";
        else if (question instanceof Verb)      wordType = "verb";
        else if (question instanceof Adjective) wordType = "adjective";
        else if (question instanceof Adverb)    wordType = "adverb";

        QuizQuestion quiz = new QuizQuestion();
        quiz.setWordId(question.getLiteral());
        quiz.setWordType(wordType);
        quiz.setLiteral(question.getLiteral());
        quiz.setHelpPhrase(question.getHelpPhrase());
        quiz.setChoices(choices);
        quiz.setCorrectAnswer(question.getTranslation());

        if (question instanceof Noun) {
            quiz.setArticle(((Noun) question).getArticle());
        }
        if (question instanceof Verb) {
            String inf = ((Verb) question).getInfinitive();
            if (inf != null && !inf.trim().isEmpty()) quiz.setInfinitive(inf);
        }

        return ResponseEntity.ok(quiz);
    }

    // ── TRAINING: SUBMIT ANSWER ───────────────────────────────────────────────

    @PostMapping("/quiz/answer")
    public ResponseEntity<Map<String, Object>> submitAnswer(@RequestBody Map<String, String> body) {
        String wordId     = body.get("wordId");
        String userAnswer = body.get("answer");

        Optional<? extends Word> found = findWordById(wordId);
        if (!found.isPresent()) {
            Map<String, Object> err = new HashMap<>();
            err.put("correct", false);
            err.put("message", "Mot introuvable.");
            return ResponseEntity.badRequest().body(err);
        }

        Word word = found.get();
        boolean correct = word.getTranslation()
            .equalsIgnoreCase(userAnswer != null ? userAnswer.trim() : "");

        int newDiff = correct
            ? Math.max(Word.MIN_DIFFICULTY, word.getDifficulty() - 3000)
            : Math.min(Word.MAX_DIFFICULTY, word.getDifficulty() + 1000);
        word.setDifficulty(newDiff);
        saveWord(word);

        Map<String, Object> response = new HashMap<>();
        response.put("correct", correct);
        response.put("correctAnswer", word.getTranslation());
        response.put("message", correct
            ? "\u2713 Bonne r\u00e9ponse !"
            : "\u2717 La bonne r\u00e9ponse \u00e9tait : " + word.getTranslation());
        return ResponseEntity.ok(response);
    }

    // ── HELPERS ───────────────────────────────────────────────────────────────

    private boolean blank(String s) { return s == null || s.trim().isEmpty(); }

    private Map<String, String> strMap(String k, String v) {
        Map<String, String> m = new HashMap<>(); m.put(k, v); return m;
    }

    private Map<String, Object> wordToMap(Word w, String type) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("literal",     w.getLiteral());
        m.put("translation", w.getTranslation());
        m.put("helpPhrase",  w.getHelpPhrase() != null ? w.getHelpPhrase() : "");
        m.put("type",        type);
        if (w instanceof Noun) {
            m.put("article", ((Noun) w).getArticle());
        }
        if (w instanceof Verb) {
            Verb v = (Verb) w;
            m.put("infinitive",   v.getInfinitive() != null ? v.getInfinitive() : "");
            m.put("conjugation",  v.getSimplePresent() != null ? v.getSimplePresent() : new HashMap<>());
        }
        return m;
    }

    private Optional<? extends Word> findWordById(String literal) {
        Optional<Noun>      noun = nounRepository.findById(literal);      if (noun.isPresent()) return noun;
        Optional<Verb>      verb = verbRepository.findById(literal);      if (verb.isPresent()) return verb;
        Optional<Adjective> adj  = adjectiveRepository.findById(literal); if (adj.isPresent())  return adj;
        return adverbRepository.findById(literal);
    }

    private void saveWord(Word word) {
        if      (word instanceof Noun)      nounRepository.save((Noun) word);
        else if (word instanceof Verb)      verbRepository.save((Verb) word);
        else if (word instanceof Adjective) adjectiveRepository.save((Adjective) word);
        else if (word instanceof Adverb)    adverbRepository.save((Adverb) word);
    }
}
