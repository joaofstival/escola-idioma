// Dicionário offline (último recurso da tradução): ~100 palavras e expressões de sala de aula.
// Cada linha é a mesma palavra nos 6 idiomas; serve para qualquer par entre eles (pt↔en/es/fr/de/it e entre si).
export type IdiomaDicionario = 'pt' | 'en' | 'es' | 'fr' | 'de' | 'it';
export type EntradaDicionario = Record<IdiomaDicionario, string>;

const L = (pt: string, en: string, es: string, fr: string, de: string, it: string): EntradaDicionario => ({ pt, en, es, fr, de, it });

export const DICIONARIO: EntradaDicionario[] = [
  // Escola
  L('livro', 'book', 'libro', 'livre', 'Buch', 'libro'),
  L('caderno', 'notebook', 'cuaderno', 'cahier', 'Heft', 'quaderno'),
  L('caneta', 'pen', 'bolígrafo', 'stylo', 'Kugelschreiber', 'penna'),
  L('lápis', 'pencil', 'lápiz', 'crayon', 'Bleistift', 'matita'),
  L('borracha', 'eraser', 'goma', 'gomme', 'Radiergummi', 'gomma'),
  L('mesa', 'table', 'mesa', 'table', 'Tisch', 'tavolo'),
  L('cadeira', 'chair', 'silla', 'chaise', 'Stuhl', 'sedia'),
  L('professor', 'teacher', 'profesor', 'professeur', 'Lehrer', 'insegnante'),
  L('professora', 'teacher', 'profesora', 'professeure', 'Lehrerin', 'insegnante'),
  L('aluno', 'student', 'alumno', 'élève', 'Schüler', 'studente'),
  L('aluna', 'student', 'alumna', 'élève', 'Schülerin', 'studentessa'),
  L('escola', 'school', 'escuela', 'école', 'Schule', 'scuola'),
  L('sala de aula', 'classroom', 'aula', 'salle de classe', 'Klassenzimmer', 'aula'),
  L('aula', 'class', 'clase', 'cours', 'Unterricht', 'lezione'),
  L('lição', 'lesson', 'lección', 'leçon', 'Lektion', 'lezione'),
  L('prova', 'exam', 'examen', 'examen', 'Prüfung', 'esame'),
  L('tarefa', 'homework', 'tarea', 'devoirs', 'Hausaufgabe', 'compiti'),
  L('pergunta', 'question', 'pregunta', 'question', 'Frage', 'domanda'),
  L('resposta', 'answer', 'respuesta', 'réponse', 'Antwort', 'risposta'),
  L('palavra', 'word', 'palabra', 'mot', 'Wort', 'parola'),
  L('frase', 'sentence', 'frase', 'phrase', 'Satz', 'frase'),
  L('idioma', 'language', 'idioma', 'langue', 'Sprache', 'lingua'),
  L('dicionário', 'dictionary', 'diccionario', 'dictionnaire', 'Wörterbuch', 'dizionario'),
  L('quadro', 'board', 'pizarra', 'tableau', 'Tafel', 'lavagna'),
  L('papel', 'paper', 'papel', 'papier', 'Papier', 'carta'),
  L('mochila', 'backpack', 'mochila', 'sac à dos', 'Rucksack', 'zaino'),
  L('biblioteca', 'library', 'biblioteca', 'bibliothèque', 'Bibliothek', 'biblioteca'),
  L('computador', 'computer', 'ordenador', 'ordinateur', 'Computer', 'computer'),
  L('nota', 'grade', 'nota', 'note', 'Note', 'voto'),
  L('amigo', 'friend', 'amigo', 'ami', 'Freund', 'amico'),
  // Casa e cotidiano
  L('casa', 'house', 'casa', 'maison', 'Haus', 'casa'),
  L('água', 'water', 'agua', 'eau', 'Wasser', 'acqua'),
  L('comida', 'food', 'comida', 'nourriture', 'Essen', 'cibo'),
  L('pão', 'bread', 'pan', 'pain', 'Brot', 'pane'),
  L('café', 'coffee', 'café', 'café', 'Kaffee', 'caffè'),
  L('família', 'family', 'familia', 'famille', 'Familie', 'famiglia'),
  L('pai', 'father', 'padre', 'père', 'Vater', 'padre'),
  L('mãe', 'mother', 'madre', 'mère', 'Mutter', 'madre'),
  L('irmão', 'brother', 'hermano', 'frère', 'Bruder', 'fratello'),
  L('irmã', 'sister', 'hermana', 'sœur', 'Schwester', 'sorella'),
  L('cidade', 'city', 'ciudad', 'ville', 'Stadt', 'città'),
  L('rua', 'street', 'calle', 'rue', 'Straße', 'strada'),
  L('trabalho', 'work', 'trabajo', 'travail', 'Arbeit', 'lavoro'),
  L('tempo', 'time', 'tiempo', 'temps', 'Zeit', 'tempo'),
  L('dia', 'day', 'día', 'jour', 'Tag', 'giorno'),
  L('noite', 'night', 'noche', 'nuit', 'Nacht', 'notte'),
  L('semana', 'week', 'semana', 'semaine', 'Woche', 'settimana'),
  L('mês', 'month', 'mes', 'mois', 'Monat', 'mese'),
  L('ano', 'year', 'año', 'année', 'Jahr', 'anno'),
  L('hoje', 'today', 'hoy', "aujourd'hui", 'heute', 'oggi'),
  L('amanhã', 'tomorrow', 'mañana', 'demain', 'morgen', 'domani'),
  L('ontem', 'yesterday', 'ayer', 'hier', 'gestern', 'ieri'),
  // Expressões
  L('olá', 'hello', 'hola', 'bonjour', 'hallo', 'ciao'),
  L('tchau', 'bye', 'adiós', 'au revoir', 'tschüss', 'ciao'),
  L('bom dia', 'good morning', 'buenos días', 'bonjour', 'guten Morgen', 'buongiorno'),
  L('boa tarde', 'good afternoon', 'buenas tardes', 'bon après-midi', 'guten Tag', 'buon pomeriggio'),
  L('boa noite', 'good night', 'buenas noches', 'bonne nuit', 'gute Nacht', 'buonanotte'),
  L('obrigado', 'thank you', 'gracias', 'merci', 'danke', 'grazie'),
  L('obrigada', 'thank you', 'gracias', 'merci', 'danke', 'grazie'),
  L('por favor', 'please', 'por favor', "s'il vous plaît", 'bitte', 'per favore'),
  L('desculpe', 'sorry', 'perdón', 'pardon', 'Entschuldigung', 'scusa'),
  L('sim', 'yes', 'sí', 'oui', 'ja', 'sì'),
  L('não', 'no', 'no', 'non', 'nein', 'no'),
  L('bom', 'good', 'bueno', 'bon', 'gut', 'buono'),
  L('ruim', 'bad', 'malo', 'mauvais', 'schlecht', 'cattivo'),
  L('grande', 'big', 'grande', 'grand', 'groß', 'grande'),
  L('pequeno', 'small', 'pequeño', 'petit', 'klein', 'piccolo'),
  L('fácil', 'easy', 'fácil', 'facile', 'einfach', 'facile'),
  L('difícil', 'difficult', 'difícil', 'difficile', 'schwierig', 'difficile'),
  // Números
  L('um', 'one', 'uno', 'un', 'eins', 'uno'),
  L('dois', 'two', 'dos', 'deux', 'zwei', 'due'),
  L('três', 'three', 'tres', 'trois', 'drei', 'tre'),
  L('quatro', 'four', 'cuatro', 'quatre', 'vier', 'quattro'),
  L('cinco', 'five', 'cinco', 'cinq', 'fünf', 'cinque'),
  L('seis', 'six', 'seis', 'six', 'sechs', 'sei'),
  L('sete', 'seven', 'siete', 'sept', 'sieben', 'sette'),
  L('oito', 'eight', 'ocho', 'huit', 'acht', 'otto'),
  L('nove', 'nine', 'nueve', 'neuf', 'neun', 'nove'),
  L('dez', 'ten', 'diez', 'dix', 'zehn', 'dieci'),
  // Cores
  L('vermelho', 'red', 'rojo', 'rouge', 'rot', 'rosso'),
  L('azul', 'blue', 'azul', 'bleu', 'blau', 'blu'),
  L('verde', 'green', 'verde', 'vert', 'grün', 'verde'),
  L('amarelo', 'yellow', 'amarillo', 'jaune', 'gelb', 'giallo'),
  L('preto', 'black', 'negro', 'noir', 'schwarz', 'nero'),
  L('branco', 'white', 'blanco', 'blanc', 'weiß', 'bianco'),
  // Dias da semana
  L('segunda-feira', 'Monday', 'lunes', 'lundi', 'Montag', 'lunedì'),
  L('terça-feira', 'Tuesday', 'martes', 'mardi', 'Dienstag', 'martedì'),
  L('quarta-feira', 'Wednesday', 'miércoles', 'mercredi', 'Mittwoch', 'mercoledì'),
  L('quinta-feira', 'Thursday', 'jueves', 'jeudi', 'Donnerstag', 'giovedì'),
  L('sexta-feira', 'Friday', 'viernes', 'vendredi', 'Freitag', 'venerdì'),
  L('sábado', 'Saturday', 'sábado', 'samedi', 'Samstag', 'sabato'),
  L('domingo', 'Sunday', 'domingo', 'dimanche', 'Sonntag', 'domenica'),
  // Meses
  L('janeiro', 'January', 'enero', 'janvier', 'Januar', 'gennaio'),
  L('fevereiro', 'February', 'febrero', 'février', 'Februar', 'febbraio'),
  L('março', 'March', 'marzo', 'mars', 'März', 'marzo'),
  L('abril', 'April', 'abril', 'avril', 'April', 'aprile'),
  L('maio', 'May', 'mayo', 'mai', 'Mai', 'maggio'),
  L('junho', 'June', 'junio', 'juin', 'Juni', 'giugno'),
  L('julho', 'July', 'julio', 'juillet', 'Juli', 'luglio'),
  L('agosto', 'August', 'agosto', 'août', 'August', 'agosto'),
  L('setembro', 'September', 'septiembre', 'septembre', 'September', 'settembre'),
  L('outubro', 'October', 'octubre', 'octobre', 'Oktober', 'ottobre'),
  L('novembro', 'November', 'noviembre', 'novembre', 'November', 'novembre'),
  L('dezembro', 'December', 'diciembre', 'décembre', 'Dezember', 'dicembre'),
];

export const IDIOMAS_DICIONARIO: readonly IdiomaDicionario[] = ['pt', 'en', 'es', 'fr', 'de', 'it'];

function chave(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}

const indice = new Map<string, EntradaDicionario[]>();
for (const e of DICIONARIO) {
  for (const idi of IDIOMAS_DICIONARIO) {
    const k = `${idi}|${chave(e[idi])}`;
    const lista = indice.get(k) ?? [];
    lista.push(e);
    indice.set(k, lista);
  }
}

/** Procura no dicionário (sem diferenciar maiúsculas e acentos). Devolve a tradução e alternativas, ou null. */
export function consultarDicionario(texto: string, de: string, para: string): { traducao: string; alternativas: string[] } | null {
  if (!(IDIOMAS_DICIONARIO as readonly string[]).includes(de) || !(IDIOMAS_DICIONARIO as readonly string[]).includes(para)) return null;
  const achados = indice.get(`${de}|${chave(texto)}`);
  if (!achados?.length) return null;
  const opcoes = [...new Set(achados.map((e) => e[para as IdiomaDicionario]))];
  return { traducao: opcoes[0], alternativas: opcoes.slice(1) };
}
