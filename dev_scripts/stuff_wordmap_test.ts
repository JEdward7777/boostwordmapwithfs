import Lexer,{Token} from "wordmap-lexer";
import * as fs from "fs-extra";
//import {Suggestion, Engine, Prediction} from "../";
//import WordMap from "../";
import WordMap from "wordmap";
import { Alignment, Ngram } from 'wordmap';
import * as AdmZip from 'adm-zip';
//import usfmjs from 'usfm-js';
const usfmjs = require('usfm-js');

// import * as map_without_alignment from './map_without_alignment';
// import * as map_with_catboost from './map_with_catboost';




function load_book(folderPath: string): Map<number, any> {
    const bookJsonMap: Map<number, any> = new Map();
    for (let i = 1; ; i++) {
        const filePath = `${folderPath}/${i}.json`;
        if (!fs.existsSync(filePath)) {
            break;
        }
        const jsonString = fs.readFileSync(filePath, "utf8");
        const bookJson = JSON.parse(jsonString);
        bookJsonMap.set(i, bookJson);
    }
    return bookJsonMap;
}
  

class ChapterVerse {
    constructor(public chapter: number, public verse: number) {}
}
  
  
function extract_alignment_frequency( map: WordMap ): object{
    return {
        'alignPermFreqIndex' : Array.from( (map as any).engine.alignmentMemoryIndex.permutationIndex.alignPermFreqIndex.index ),
        'srcNgramPermFreqIndex' : Array.from( (map as any).engine.alignmentMemoryIndex.permutationIndex.srcNgramPermFreqIndex.index ),
        'tgtNgramPermFreqIndex' : Array.from( (map as any).engine.alignmentMemoryIndex.permutationIndex.tgtNgramPermFreqIndex.index ) };
}


/**
 * Converts verse objects (as in from the source language verse) into {@link Token}s.
 * @param verseObjects An array of VerseObject.
 * @returns An array of Token.
 */
function tokenizeVerseObjects(words: any[]): Token[]{
    const tokens: Token[] = [];
    const completeTokens: Token[] = []; // includes occurrences
    const occurrences: { [key: string]: number } = {};
    let position = 0;
    let sentenceCharLength = 0;
    for (const word of words) {
      if (typeof occurrences[word.text] === 'undefined') {
        occurrences[word.text] = 0;
      }
      sentenceCharLength += word.text.length;
      occurrences[word.text]++;
      tokens.push( new Token({
        text: word.text,
        strong: (word.strong || word.strongs),
        morph: word.morph,
        lemma: word.lemma,
        position: position,
        occurrence: occurrences[word.text]
      }));
      position++;
    }
    // inject occurrences
    for (const token of tokens) {
      completeTokens.push(new Token({
        text: (token as any).text,
        strong: token.strong,
        morph: token.morph,
        lemma: token.lemma,
        position: token.position,
        occurrence: token.occurrence,
        occurrences: occurrences[(token as any).text],
        sentenceTokenLen: tokens.length,
        sentenceCharLen: sentenceCharLength
      }));
    }
    return completeTokens;
  };

function add_book_alignment_to_wordmap(excluded_verse: ChapterVerse, targetBook: Map<number, any>, loaded_alignment: Map<number, any>, map: WordMap): void {
    targetBook.forEach((bookJson, chapter) => {
        const chapter_alignments = loaded_alignment.get(chapter);

        for( const verse of Object.keys( bookJson ) ){

            // //skip the excluded_verse.
            // if( parseInt(verse) === excluded_verse.verse && chapter === excluded_verse.chapter ){
            //     continue;
            // }

            for( const a of chapter_alignments[verse].alignments ){
                const topTokensNoOccurences: Token[] = a.topWords.map( (word) => {
                    const word_copy = Object.assign({}, word);
                    delete word_copy.word;
                    word_copy.text = word.word;
                    return new Token( word_copy ) 
                 });
                const bottomTokensNoOccurences: Token[] = a.bottomWords.map( (word) => {
                    const word_copy = Object.assign({}, word);
                    delete word_copy.word;
                    word_copy.text = word.word;
                    return new Token( word_copy ) 
                 });
                const topTokens = tokenizeVerseObjects( topTokensNoOccurences );
                const bottomTokens = tokenizeVerseObjects( bottomTokensNoOccurences );

                const topNgram: Ngram = new Ngram( topTokens )
                const bottomNgram: Ngram = new Ngram( bottomTokens )

                const new_allignment: Alignment = new Alignment( topNgram, bottomNgram );

                if( topNgram.tokenLength && bottomNgram.tokenLength ){
                    map.appendAlignmentMemory( new_allignment );
                }
            }
        }
    });
}


interface JsonDict {
    [key: string]: any;
}

function load_json_zip(zip_path: string): JsonDict {
    const zip = new AdmZip(zip_path);
    const entries = zip.getEntries().filter(e => e.entryName.endsWith('.json'));
    const data: JsonDict = {};

    function load_json(file_data: Buffer): any {
        const file_content = file_data.toString('utf-8');
        return JSON.parse(file_content);
    }

    function stick_into_structure(dict: JsonDict, dict_path: string, content: any): void {
        const parts = dict_path.split('/');
        let current_dict = dict;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (i === parts.length - 1) {
                current_dict[part] = content;
            } else {
                if (!(part in current_dict)) {
                    current_dict[part] = {};
                }
                current_dict = current_dict[part];
            }
        }
    }

    for (const entry of entries) {
        const file_data = zip.readFile(entry.entryName);
        const file_name = entry.entryName.replace(/\.json$/, '');
        stick_into_structure(data, file_name, load_json(file_data));
    }

    return data;
}

function normalizeVerseText( verse_text_in: string ): string{
    const cleaned = usfmjs.removeMarker(verse_text_in);
    const targetTokens = Lexer.tokenize(cleaned);
    const normalizedTargetVerseText = targetTokens.map(t=>t.toString()).join(' ');
    return normalizedTargetVerseText;
}


function compile_verse_text_pair(
    greek_book: JsonDict,
    loaded_book: Map<number, any>,
    selected_verse: ChapterVerse
): { sourceVerseText: any, targetVerseText: any } {
    const sourceVerseObjects = greek_book[selected_verse.chapter][selected_verse.verse].verseObjects.filter(
        (verseObj: any) => verseObj.type === "word"
    );
    const sourceVerseTextWithLocation = tokenizeVerseObjects(sourceVerseObjects);
  
    const targetVerseText = loaded_book.get(selected_verse.chapter)?.[selected_verse.verse];
    const normalizedTargetVerseText = normalizeVerseText( targetVerseText );
  
    return { sourceVerseText: sourceVerseTextWithLocation, targetVerseText: normalizedTargetVerseText };
}


function saveJson(obj: object, path: string): void {
    const json = JSON.stringify(obj, null, 2);
    fs.writeFileSync(path, json);
}
  

if (require.main === module) {
    const currentDirectory: string = process.cwd();
    console.log('Current working directory:', currentDirectory);
    console.log( "starting with node version: ", process.version );


    const map = new WordMap({ targetNgramLength: 5, warnings: false });
    const loaded_book      = load_book( "/home/lansford/translationCore/projects/en_ult_mat_book/mat" );
    const loaded_alignment = load_book( "/home/lansford/translationCore/projects/en_ult_mat_book/.apps/translationCore/alignmentData/mat")
    const greek_bible      = load_json_zip( "/home/lansford/work2/Mission_Mutual/translationCore/tcResources/el-x-koine/bibles/ugnt/v0.30_Door43-Catalog/books.zip" )

    add_book_alignment_to_wordmap( new ChapterVerse(1, 1), loaded_book, loaded_alignment, map);


    const stats_collected = extract_alignment_frequency( map );
    saveJson(stats_collected, './dev_scripts/data/alignment_memory_injection2.json' );

    //now see if we can produce the same sourceVerseText and targetVerseText.
    const verseTextPair = compile_verse_text_pair( greek_bible.mat, loaded_book, new ChapterVerse(1, 1) );
    saveJson( verseTextPair, "./dev_scripts/data/tokenized_verse_data2.json" );
}