import Lexer,{Token} from "wordmap-lexer";
import WordMap from "wordmap";
import { Alignment, Ngram } from 'wordmap';
//import usfmjs from 'usfm-js';
const usfmjs = require('usfm-js');
import {JsonDict} from "./json_tools";


export class ChapterVerse {
    constructor(public chapter: number, public verse: number) {}
}
  
  
export function extract_alignment_frequency( map: WordMap ): object{
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



export function add_book_alignment_to_wordmap(excluded_verse: ChapterVerse, targetBook: { [key: number]: any }, loaded_alignment: { [key: number]: any }, map: WordMap): void {
    Object.entries(targetBook).forEach(([chapter, bookJson]) => {
        if( !["headers", "manifest"].includes(chapter) ){ 

            const chapter_alignments = loaded_alignment[chapter];

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

                    const new_alignment: Alignment = new Alignment( topNgram, bottomNgram );

                    if( topNgram.tokenLength && bottomNgram.tokenLength ){
                        map.appendAlignmentMemory( new_alignment );
                    }
                }
            }
        }
    });
}


function normalizeVerseText( verse_text_in: string ): string{
    const cleaned = usfmjs.removeMarker(verse_text_in);
    const targetTokens = Lexer.tokenize(cleaned);
    const normalizedTargetVerseText = targetTokens.map(t=>t.toString()).join(' ');
    return normalizedTargetVerseText;
}


export function compile_verse_text_pair(
    greek_book: JsonDict,
    loaded_book: { [key: number]: any },
    selected_verse: ChapterVerse
): { sourceVerseText: any, targetVerseText: any } {
    const sourceVerseObjects = greek_book[selected_verse.chapter][selected_verse.verse].verseObjects.filter(
        (verseObj: any) => verseObj.type === "word"
    );
    const sourceVerseTextWithLocation = tokenizeVerseObjects(sourceVerseObjects);
  
    const targetVerseText = loaded_book[selected_verse.chapter]?.[selected_verse.verse];
    const normalizedTargetVerseText = normalizeVerseText( targetVerseText );
  
    return { sourceVerseText: sourceVerseTextWithLocation, targetVerseText: normalizedTargetVerseText };
}
