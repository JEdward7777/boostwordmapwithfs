import Lexer,{Token} from "wordmap-lexer";
import * as fs from "fs-extra";
//import {Suggestion, Engine, Prediction} from "../";
//import WordMap from "../";
import WordMap from "wordmap";
import { Alignment, Ngram } from 'wordmap';

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
  
  
function alignment_frequency_to_string( map: WordMap ){

    return JSON.stringify({
        'alignPermFreqIndex' : Array.from( (map as any).engine.alignmentMemoryIndex.permutationIndex.alignPermFreqIndex.index ),
        'srcNgramPermFreqIndex' : Array.from( (map as any).engine.alignmentMemoryIndex.permutationIndex.srcNgramPermFreqIndex.index ),
        'tgtNgramPermFreqIndex' : Array.from( (map as any).engine.alignmentMemoryIndex.permutationIndex.tgtNgramPermFreqIndex.index ) }, null, 2);
}

function add_book_alignment_to_wordmap(excluded_verse: ChapterVerse, targetBook: Map<number, any>, loaded_alignment: Map<number, any>, map: WordMap): void {
    targetBook.forEach((bookJson, chapter) => {
        const chapter_alignments = loaded_alignment.get(chapter);

        for( const verse of Object.keys( bookJson ) ){

            //skip the excluded_verse.
            if( parseInt(verse) === excluded_verse.verse && chapter === excluded_verse.chapter ){
                continue;
            }

            for( const a of chapter_alignments[verse].alignments ){
                const topTokens: Token[] = a.topWords.map( (word) => {
                    const word_copy = Object.assign({}, word);
                    delete word_copy.word;
                    word_copy.text = word.word;
                    return new Token( word_copy ) 
                 });
                const bottomTokens: Token[] = a.bottomWords.map( (word) => {
                    const word_copy = Object.assign({}, word);
                    delete word_copy.word;
                    word_copy.text = word.word;
                    return new Token( word_copy ) 
                 });

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


  

if (require.main === module) {
    const currentDirectory: string = process.cwd();
    console.log('Current working directory:', currentDirectory);
    console.log( "starting with node version: ", process.version );


    const map = new WordMap({ targetNgramLength: 5, warnings: false });
    const loaded_book      = load_book( "/home/lansford/translationCore/projects/en_ult_mat_book/mat" );
    const loaded_alignment = load_book( "/home/lansford/translationCore/projects/en_ult_mat_book/.apps/translationCore/alignmentData/mat")

    add_book_alignment_to_wordmap( new ChapterVerse(1, 1), loaded_book, loaded_alignment, map);


    const stats_collected = alignment_frequency_to_string( map );

    fs.writeFile('./dev_scipts/data/alignment_memory_injection2.json', stats_collected, (err) => {
        if (err) throw err;
        console.log('Data saved to file!');
    });
}