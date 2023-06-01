import Lexer,{Token} from "wordmap-lexer";
import WordMap from "wordmap";
import { Alignment, Ngram, Suggestion, Prediction, Engine } from 'wordmap';
//import usfmjs from 'usfm-js';
const usfmjs = require('usfm-js');
import {JsonDict} from "./json_tools";
import { Writable } from 'stream';


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



export function add_book_alignment_to_wordmap( targetBook: { [key: number]: any }, loaded_alignment: { [key: number]: any }, map: WordMap, excluded_verse: ChapterVerse | null = null ): void {
    Object.entries(targetBook).forEach(([chapter, bookJson]) => {
        if( !["headers", "manifest"].includes(chapter) ){ 

            const chapter_alignments = loaded_alignment[chapter];

            for( const verse of Object.keys( bookJson ) ){

                //skip the excluded_verse.
                if( excluded_verse !== null && parseInt(verse) === excluded_verse.verse && parseInt(chapter) === excluded_verse.chapter ){
                    continue;
                }

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
    source_book: JsonDict,
    target_book: { [key: number]: any },
    selected_verse: ChapterVerse
): { sourceVerseText: any, targetVerseText: any } {
    const sourceVerseObjects = source_book[selected_verse.chapter][selected_verse.verse].verseObjects.filter(
        (verseObj: any) => verseObj.type === "word"
    );
    const sourceVerseTextWithLocation = tokenizeVerseObjects(sourceVerseObjects);
  
    const targetVerseText = target_book[selected_verse.chapter]?.[selected_verse.verse];
    const normalizedTargetVerseText = normalizeVerseText( targetVerseText );
  
    return { sourceVerseText: sourceVerseTextWithLocation, targetVerseText: normalizedTargetVerseText };
}

export function convert_tc_to_token_dict( book_id: string, text: { [key: number]: any }, is_greek_token_format: boolean ): { [key: string]: Token[] }{
    const result: { [key: string]: Token[] } = {};
    Object.entries( text ).forEach( ([chapter_num,chapter_content]) => {
        Object.entries( chapter_content ).forEach( ([verse_num,verse_content]) => {
            const verse_key = `${book_id}_${chapter_num}:${verse_num}`;
            let tokens : Token[] = null;
            if( is_greek_token_format ){
                const sourceVerseObjects = (verse_content as any).verseObjects.filter(
                    (verseObj: any) => verseObj.type === "word"
                );
                tokens = tokenizeVerseObjects(sourceVerseObjects);
            }else{
                const cleaned = usfmjs.removeMarker(verse_content);
                tokens = Lexer.tokenize(cleaned);
            }
            if( tokens.length > 0 ) result[verse_key] = tokens;
        });
    });

    return result;
}

/**
Converts the alignment data from the TranslationCore file format to the WordMap object structure.
@param book_id A string used to identify the book, for example "mat".
@param alignments The alignment data in the TranslationCore file format.
@param source_tokens The converted tokens in the source language, used to supply source Tokens.
@param target_tokens The converted tokens in the target language, used to supply target Tokens.
@returns An object containing an array of Alignment objects in the WordMap object structure.
*/
export function convert_alignment_to_alignment_dict( book_id: string, alignments: { [key: number]: any}, source_tokens: { [key: string]: Token[] }, target_tokens: { [key: string]: Token[] } ): { [key: string]: Alignment[] }{
    const result: {[key: string]: Alignment[]} = {};
    Object.entries( alignments ).forEach( ([chapter_num,chapter_content]) => {
        Object.entries( chapter_content ).forEach( ([verse_num,verse_content]) => {
            const verse_key = `${book_id}_${chapter_num}:${verse_num}`;

            if( verse_key in source_tokens && verse_key in target_tokens ){

                const source_verse_tokens : Token[] = source_tokens[verse_key];
                const target_verse_tokens : Token[] = target_tokens[verse_key];

                let found_alignments : Alignment[] = [];

                Object.entries( (verse_content as any).alignments ).forEach( ([alignment_num,alignment_content]) => {

                    let found_top_words : Token[] = [];
                    Object.entries( (alignment_content as any ).topWords ).forEach( ([_word_num,word_content] ) => {
                        //try and find this word in the source_verse_tokens.
                        source_verse_tokens.forEach( token => {
                            //if( token.text != )
                            if( token.toString() !== (word_content as any).word ) return;
                            if( token.occurrences !== (word_content as any).occurrences ) return;
                            if( token.occurrence !== (word_content as any).occurrence ) return;

                            found_top_words.push( token );
                        });
                    });
                    let found_bottom_words : Token[] = [];
                    Object.entries( (alignment_content as any ).bottomWords ).forEach( ([word_num,word_content] ) => {
                        //try and find this word in the target_verse_tokens.
                        target_verse_tokens.forEach( token => {
                            //if( token.text != )
                            if( token.toString() !== (word_content as any).word ) return;
                            if( token.occurrences !== (word_content as any).occurrences ) return;
                            if( token.occurrence !== (word_content as any).occurrence ) return;
                            found_bottom_words.push( token );
                        });
                    });

                    found_alignments.push( new Alignment( new Ngram(found_top_words), new Ngram(found_bottom_words)));

                });

                result[verse_key] = found_alignments;
            }
        });
    });

    return result;    
}

export function word_map_predict_tokens( m: WordMap, from_tokens: Token[], to_tokens: Token[], maxSuggestions: number = 1, minConfidence: number = 0.1 ): Suggestion[]{
    const engine_run = (m as any).engine.run( from_tokens, to_tokens );
    const predictions = (m as any).engine.score( engine_run );
    const suggestions = Engine.suggest(predictions, maxSuggestions, (m as any).forceOccurrenceOrder, minConfidence);
    return suggestions;
}

export function is_correct_prediction( suggested_mapping: Prediction, manual_mappings: Alignment[] ): boolean{

    mappingLoop: for( let manual_mapping_i = 0; manual_mapping_i < manual_mappings.length; ++manual_mapping_i ){
        const manual_mapping = manual_mappings[manual_mapping_i];

        // const manual_mapping_source = manual_mapping.sourceNgram.getTokens();
        // const suggested_mapping_source = suggested_mapping.source.getTokens();
        // const manual_mapping_target = manual_mapping.targetNgram.getTokens();
        // const suggested_mapping_target = suggested_mapping.target.getTokens();
       
        const manual_mapping_source = manual_mapping.sourceNgram.getTokens().slice().sort();
        const suggested_mapping_source = suggested_mapping.source.getTokens().slice().sort();
        const manual_mapping_target = manual_mapping.targetNgram.getTokens().slice().sort();
        const suggested_mapping_target = suggested_mapping.target.getTokens().slice().sort();

        //see if the ngram on the suggestion are the same length
        if( manual_mapping_source.length != suggested_mapping_source.length ) continue mappingLoop;
        if( manual_mapping_target.length != suggested_mapping_target.length ) continue mappingLoop;

        //now check the source ngram is the same.
        for( let source_ngram_i = 0; source_ngram_i < manual_mapping_source.length; ++source_ngram_i ){
            const manual_word = manual_mapping_source[source_ngram_i];
            const suggested_word = suggested_mapping_source[source_ngram_i];

            if( manual_word.toString()!= suggested_word.toString()  ) continue mappingLoop;
            if( manual_word.occurrence  != suggested_word.occurrence  ) continue mappingLoop;
            if( manual_word.occurrences != suggested_word.occurrences ) continue mappingLoop;
        }

        //and the target ngram.
        for( let target_ngram_i = 0; target_ngram_i < manual_mapping_target.length; ++target_ngram_i ){
            const manual_word = manual_mapping_target[target_ngram_i];
            const suggested_word = suggested_mapping_target[target_ngram_i];

            if( manual_word.toString()  != suggested_word.toString()  ) continue mappingLoop;
            if( manual_word.occurrence  != suggested_word.occurrence  ) continue mappingLoop;
            if( manual_word.occurrences != suggested_word.occurrences ) continue mappingLoop;
        }

        //We found this mapping so no need to keep looking for it.
        return true;
    }
    return false;
}

export function is_part_of_correct_prediction( suggested_mapping: Prediction, manual_mappings: Alignment[] ): boolean{
    //This assumes that the predictions passed in do not have ngrams greater then one.

    mappingLoop: for( let manual_mapping_i = 0; manual_mapping_i < manual_mappings.length; ++manual_mapping_i ){
        const manual_mapping = manual_mappings[manual_mapping_i];

        const manual_mapping_source = manual_mapping.sourceNgram.getTokens();
        
        const suggested_mapping_source = suggested_mapping.source.getTokens();
        const manual_mapping_target = manual_mapping.targetNgram.getTokens();
        const suggested_mapping_target = suggested_mapping.target.getTokens();


        //now check the source ngram is a subset of the prediction
        //every suggested source word has to be in the manual source for us to have found it.
        for( let suggested_source_ngram_i = 0; suggested_source_ngram_i < suggested_mapping_source.length; ++suggested_source_ngram_i ){
            const suggested_source_word = suggested_mapping_source[suggested_source_ngram_i];

            let found_source = false;
            for( let source_ngram_i = 0; source_ngram_i < manual_mapping_source.length && !found_source; ++source_ngram_i ){
                const manual_word = manual_mapping_source[source_ngram_i];

                if( manual_word.toString()  == suggested_source_word.toString() &&
                        manual_word.occurrence  == suggested_source_word.occurrence &&
                        manual_word.occurrences == suggested_source_word.occurrences ){
                    found_source = true;
                }
            }
            if( !found_source ) continue mappingLoop;
        }

        //and the target ngram.
        for( let suggested_target_ngram_i = 0; suggested_target_ngram_i < suggested_mapping_target.length; ++suggested_target_ngram_i ){
            const suggested_target_word = suggested_mapping_target[suggested_target_ngram_i];

            let found_target = false;
            for( let target_ngram_i = 0; target_ngram_i < manual_mapping_target.length && !found_target; ++target_ngram_i ){
                const manual_word = manual_mapping_target[target_ngram_i];

                if( manual_word.toString() == suggested_target_word.toString() &&
                        manual_word.occurrence == suggested_target_word.occurrence &&
                        manual_word.occurrences == suggested_target_word.occurrences ){
                    found_target = true;
                }
            }
            if( !found_target ) continue mappingLoop;
        }

        //We found this mapping so no need to keep looking for it.
        return true;
    }
    return false;
}

export function grade_mapping_method( source_sentence_tokens_dict : { [key: string]: Token[] }, 
                                      target_sentence_tokens_dict : { [key: string]: Token[] },
                                    manual_mappings_dict: { [key: string]:  Alignment[] }, 
                                    output_stream: Writable,
                                    mapping_function: (from_tokens: Token[], to_tokens: Token[]) => Suggestion[] ){
    output_stream.write( "verse id,num_manual_mappings,num_suggested_mappings,num_correct_mappings\n");

    Object.entries(target_sentence_tokens_dict).forEach(([sentence_key,target_sentence_tokens]) => {
        if( sentence_key in source_sentence_tokens_dict ){
            const source_sentence_tokens = source_sentence_tokens_dict[sentence_key];


            const suggestions: Suggestion[] = mapping_function( source_sentence_tokens, target_sentence_tokens );

            const manual_mappings = manual_mappings_dict[ sentence_key ];
            const firstPredictions = suggestions[0].getPredictions();

            let num_correct_mappings = 0;
            for( let suggested_mapping_i = 0; suggested_mapping_i < firstPredictions.length; ++suggested_mapping_i ){
                if( is_correct_prediction( firstPredictions[suggested_mapping_i], manual_mappings ) ){
                    num_correct_mappings++;
                }
            }
            output_stream.write( `${sentence_key},${manual_mappings.length},${firstPredictions.length},${num_correct_mappings}\n`)

            if( global.gc ){
                global.gc();
            }
        }
    
    });
}