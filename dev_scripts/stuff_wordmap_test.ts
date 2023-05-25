//import {Suggestion, Engine, Prediction} from "../";
//import WordMap from "../";
import WordMap from "wordmap";

import {recursive_json_load, saveJson} from "../src/json_tools";

import {ChapterVerse, add_book_alignment_to_wordmap, extract_alignment_frequency, compile_verse_text_pair} from "../src/wordmap_tools";


if (require.main === module) {
    const currentDirectory: string = process.cwd();
    console.log('Current working directory:', currentDirectory);
    console.log( "starting with node version: ", process.version );


    const map = new WordMap({ targetNgramLength: 5, warnings: false });
    const loaded_book      = recursive_json_load( "/home/lansford/translationCore/projects/en_ult_mat_book/mat" );
    const loaded_alignment = recursive_json_load( "/home/lansford/translationCore/projects/en_ult_mat_book/.apps/translationCore/alignmentData/mat")
    const greek_bible      = recursive_json_load( "/home/lansford/work2/Mission_Mutual/translationCore/tcResources/el-x-koine/bibles/ugnt/v0.30_Door43-Catalog/books.zip" )

    add_book_alignment_to_wordmap( loaded_book, loaded_alignment, map);


    const stats_collected = extract_alignment_frequency( map );
    saveJson(stats_collected, './dev_scripts/data/alignment_memory_injection2.json' );

    //now see if we can produce the same sourceVerseText and targetVerseText.
    const verseTextPair = compile_verse_text_pair( greek_bible.mat, loaded_book, new ChapterVerse(1, 1) );
    saveJson( verseTextPair, "./dev_scripts/data/tokenized_verse_data2.json" );

    console.log( "done" );
}