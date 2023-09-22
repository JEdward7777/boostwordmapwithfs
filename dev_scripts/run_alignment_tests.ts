import {recursive_json_load } from "./json_tools";
import {add_book_alignment_to_wordmap, convert_alignment_to_alignment_dict, convert_tc_to_token_dict, grade_mapping_method, token_to_hash, updateTokenLocations, word_map_predict_tokens} from "wordmapbooster/dist/wordmap_tools";
import WordMap, {Suggestion,Alignment, Ngram} from "wordmap";
import { WriteStream, createWriteStream } from 'fs';
import * as fs from "fs";
import {Token} from "wordmap-lexer";
import { AbstractWordMapWrapper, JLBoostWordMap, MorphJLBoostWordMap, PlaneWordMap } from "wordmapbooster/dist/boostwordmap_tools";
import { CatBoostWordMap, FirstLetterBoostWordMap, MorphCatBoostWordMap } from "./boostwordmap_tools_needing_fs";
// @ts-ignore
import { toJSON as usfm_toJSON } from "usfm-js";


function run_plane_wordmap_test(){
    const loaded_alignment = recursive_json_load( "/home/lansford/translationCore/projects/en_ult_mat_book/.apps/translationCore/alignmentData/mat")

    //here is matthew
    const mat_english  = recursive_json_load( "/home/lansford/translationCore/projects/en_ult_mat_book/mat" );
    const mat_greek    = recursive_json_load( "/home/lansford/work2/Mission_Mutual/translationCore/tcResources/el-x-koine/bibles/ugnt/v0.30_Door43-Catalog/books.zip" ).mat

    const mat_lte_c14 = Object.fromEntries( Object.entries( mat_english).filter(([key, value]) => !isNaN(Number(key)) && parseInt(key) <= 14 ) );
    const mat_gt_c14 = Object.fromEntries( Object.entries( mat_english).filter(([key, value]) => !isNaN(Number(key)) && parseInt(key) > 14 ) );


    const map = new WordMap({ targetNgramLength: 5, warnings: false });
    add_book_alignment_to_wordmap( mat_lte_c14, loaded_alignment, map);



    const converted_mat_lte_c14 = convert_tc_to_token_dict( "mat", mat_lte_c14, false );
    const converted_mat_gt_c14  = convert_tc_to_token_dict( "mat", mat_gt_c14,  false );
    const converted_mat_greek = convert_tc_to_token_dict( "mat", mat_greek, true );
    const train_alignment = convert_alignment_to_alignment_dict( "mat", loaded_alignment, converted_mat_greek, converted_mat_lte_c14);
    const test_alignment = convert_alignment_to_alignment_dict( "mat", loaded_alignment, converted_mat_greek, converted_mat_gt_c14);


    const mat_split_plane_csv = createWriteStream( "dev_scripts/data/mat_split_plane.csv" );

    //function plane_wordmap_method( from_tokens: Token[], to_tokens: Token[] ) => Suggestion[]{
        // return word_map_predict_tokens( map, from_tokens, to_tokens );
    //}
    const plane_wordmap_method = function( from_tokens: Token[], to_tokens: Token[] ): Suggestion[]{
        return word_map_predict_tokens( map, from_tokens, to_tokens );
    }

    grade_mapping_method( 
        converted_mat_greek, //source_sentence_tokens_dict
        converted_mat_gt_c14, //target_sentence_tokens_dict
        test_alignment, //manual_mappings_dict
        mat_split_plane_csv, //output_stream
         plane_wordmap_method //mapping_function
        )
    mat_split_plane_csv.end();


    console.log( "done" );
}

class SourceTargetData{

    wm_alignment__train        : { [key: string]: Alignment[] } | null = null;
    wm_alignment__test         : { [key: string]: Alignment[] } | null = null;
    wm_target_lang_book__train : { [key: string]: Token[] } | null = null;
    wm_target_lang_book__test  : { [key: string]: Token[] } | null = null;
    wm_source_lang_book        : { [key: string]: Token[] } | null = null;
}

function loadSourceTargetData_Mat(): SourceTargetData{
    const tc_alignment = recursive_json_load( "/home/lansford/translationCore/projects/en_ult_mat_book/.apps/translationCore/alignmentData/mat")

    //here is matthew
    const tc_target_lang_book  = recursive_json_load( "/home/lansford/translationCore/projects/en_ult_mat_book/mat" );
    const tc_source_lang_book  = recursive_json_load( "/home/lansford/work2/Mission_Mutual/translationCore/tcResources/el-x-koine/bibles/ugnt/v0.30_Door43-Catalog/books.zip" ).mat

    const tc_target_lang_book__train = Object.fromEntries( Object.entries( tc_target_lang_book).filter(([key, value]) => !isNaN(Number(key)) && parseInt(key) <= 14 ) );
    const tc_target_lang_book__test = Object.fromEntries( Object.entries( tc_target_lang_book).filter(([key, value]) => !isNaN(Number(key)) && parseInt(key) > 14 ) );


    const bookName: string = "mat";
    const data = new SourceTargetData();
    data.wm_target_lang_book__train = convert_tc_to_token_dict( bookName, tc_target_lang_book__train, false );
    data.wm_target_lang_book__test  = convert_tc_to_token_dict( bookName, tc_target_lang_book__test,  false );
    data.wm_source_lang_book = convert_tc_to_token_dict( bookName, tc_source_lang_book, true );
    data.wm_alignment__train = convert_alignment_to_alignment_dict( bookName, tc_alignment, data.wm_source_lang_book, data.wm_target_lang_book__train);
    data.wm_alignment__test = convert_alignment_to_alignment_dict( bookName, tc_alignment, data.wm_source_lang_book, data.wm_target_lang_book__test);

    return data;
}

function loadSourceTargetData_Tit(): SourceTargetData{
    const tc_alignment = recursive_json_load( "/home/lansford/translationCore/projects/en_ult_tit_book/.apps/translationCore/alignmentData/tit")

    //here is Titus
    const tc_target_lang_book  = recursive_json_load( "/home/lansford/translationCore/projects/en_ult_tit_book/tit" );
    const tc_source_lang_book  = recursive_json_load( "/home/lansford/work2/Mission_Mutual/translationCore/tcResources/el-x-koine/bibles/ugnt/v0.30_Door43-Catalog/books.zip" ).tit

    const tc_target_lang_book__train = Object.fromEntries( Object.entries( tc_target_lang_book).filter(([key, value]) => !isNaN(Number(key)) && parseInt(key) <= 2 ) );
    const tc_target_lang_book__test = Object.fromEntries( Object.entries( tc_target_lang_book).filter(([key, value]) => !isNaN(Number(key)) && parseInt(key) > 2 ) );


    const bookName: string = "tit";
    const data = new SourceTargetData();
    data.wm_target_lang_book__train = convert_tc_to_token_dict( bookName, tc_target_lang_book__train, false );
    data.wm_target_lang_book__test  = convert_tc_to_token_dict( bookName, tc_target_lang_book__test,  false );
    data.wm_source_lang_book = convert_tc_to_token_dict( bookName, tc_source_lang_book, true );
    data.wm_alignment__train = convert_alignment_to_alignment_dict( bookName, tc_alignment, data.wm_source_lang_book, data.wm_target_lang_book__train);
    data.wm_alignment__test = convert_alignment_to_alignment_dict( bookName, tc_alignment, data.wm_source_lang_book, data.wm_target_lang_book__test);

    return data;
}

function  loadSourceTargetData_SpanishTit(): SourceTargetData{
    const tc_alignment = recursive_json_load( "/home/lansford/translationCore/projects/es-419_glt_tit_book/.apps/translationCore/alignmentData/tit")

    const tc_target_lang_book  = recursive_json_load( "/home/lansford/translationCore/projects/es-419_glt_tit_book/tit" );
    const tc_source_lang_book  = recursive_json_load( "/home/lansford/work2/Mission_Mutual/translationCore/tcResources/el-x-koine/bibles/ugnt/v0.30_Door43-Catalog/books.zip" ).tit

    const tc_target_lang_book__train = Object.fromEntries( Object.entries( tc_target_lang_book).filter(([key, value]) => !isNaN(Number(key)) && parseInt(key) <= 2 ) );
    const tc_target_lang_book__test = Object.fromEntries( Object.entries( tc_target_lang_book).filter(([key, value]) => !isNaN(Number(key)) && parseInt(key) > 2 ) );


    const bookName: string = "tit";
    const data = new SourceTargetData();
    data.wm_target_lang_book__train = convert_tc_to_token_dict( bookName, tc_target_lang_book__train, false );
    data.wm_target_lang_book__test  = convert_tc_to_token_dict( bookName, tc_target_lang_book__test,  false );
    data.wm_source_lang_book = convert_tc_to_token_dict( bookName, tc_source_lang_book, true );
    data.wm_alignment__train = convert_alignment_to_alignment_dict( bookName, tc_alignment, data.wm_source_lang_book, data.wm_target_lang_book__train);
    data.wm_alignment__test = convert_alignment_to_alignment_dict( bookName, tc_alignment, data.wm_source_lang_book, data.wm_target_lang_book__test);

    return data;
}

function usfmEntryToToken( entry: {[key: string]: any} ){
    const tokenArg = {};
    
    // text: text in toString() out
    if( "text" in entry ) tokenArg["text"] = entry.text;
    if( "content" in entry ) tokenArg["text"] = entry.content;
    // tokenPos: position
    // charPos: characterPosition in charPosition out
    // sentenceCharLen: sentenceCharLen in sentenceCharacterLength out
    // sentenceTokenLen: sentenceTokenLen in sentenceTokenLength out
    // tokenOccurrence: occurrence
    if( "occurrence" in entry ) tokenArg["occurrence"] = entry.occurrence;
    // tokenOccurrences: occurrences
    if( "occurrences" in entry ) tokenArg["occurrences"] = entry.occurrences;
    // strongNumber: strong
    if( "strong" in entry ) tokenArg["strong"] = entry.strong;
    // lemmaString: lemma
    if( "lemma" in entry ) tokenArg["lemma"] = entry.lemma;
    // morphString: morph
    if( "morph" in entry ) tokenArg["morph"] = entry.morph;

    Object.entries( entry ).forEach(([key, value]) => {
        if( !(["occurrence", "occurrences", "text", "tag", "type", "lemma", "strong", "morph", "content", "children", "endTag"].includes(key)) ){
            console.log( "New key: " + key );
        }
    });
     return new Token(tokenArg);
}


function usfmVerseToTokens( usfmContent: {[key: string]: any} ): Token[]{
    const result: Token[] = [];
    usfmContent.forEach((entry) => {
        if( entry.type === "milestone"){
            result.push(...usfmVerseToTokens( entry.children));
        }else if( entry.type === "word"){
            result.push( usfmEntryToToken( entry ) );
        }else if( entry.type === "text"){
            //pass on text.  White space and punctuation will be removed
        }else if( ["footnote", "paragraph", "quote","section"].includes( entry.type )){
            //pass on these
        }else if( entry.type === undefined ){
            //pass on undefined
        }else{
            console.log( "New type" );
        }
    })
    return result;
}

function usfmFileToDict( usfmContent: {[key: string]: any}, bookName: string ): {[key: string]: Token[]}{
    const result: {[key: string]: Token[]} = {};
    Object.entries( usfmContent.chapters ).forEach(([chapterKey,verse]) => {
        Object.entries( verse ).forEach(([verseKey, verse]) => {
            //pass on the front matter stuff.
            if( !isNaN(+verseKey) ){
                result[`${bookName} ${chapterKey}:${verseKey}`] = usfmVerseToTokens( verse.verseObjects );
            }
        });
    });
    return result;
}


function usfmTargetVerseToAlignments( usfmContent: {[key: string]: any} ): {sourceTokens: Token[], targetTokens: Token[]}{
    const sourceTokens: Token[] = [];
    const targetTokens: Token[] = [];
    usfmContent.forEach((entry) => {
        if( entry.type === "milestone"){
            sourceTokens.push(usfmEntryToToken( entry ));
            const subResults = usfmTargetVerseToAlignments( entry.children );
            sourceTokens.push(...subResults.sourceTokens);
            targetTokens.push(...subResults.targetTokens);
        }else if( entry.type === "word"){
            targetTokens.push( usfmEntryToToken( entry ));
        }else if( entry.type === "text"){
            //pass on text.  White space and punctuation will be removed
        }else if( entry.type === "footnote"){
            //pass on footnote
        }else{
            console.log( "New type" );
        }
    })
    return {sourceTokens, targetTokens};
}


function usfmTargetFileToDict( usfmContent: {[key: string]: any}, bookName: string ): {[key: string]: Alignment[]}{
    const result: {[key: string]: Alignment[]} = {};
    Object.entries( usfmContent.chapters ).forEach(([chapterKey,verse]) => {
        Object.entries( verse ).forEach(([verseKey, verse]) => {
            //pass on the front matter stuff.
            if( !isNaN(+verseKey) ){
                verse.verseObjects.forEach((verseObject) => {
                    if( verseObject["type"] === "milestone" ){
                        const alignmentResult = usfmTargetVerseToAlignments( [verseObject] );
                        if( alignmentResult.sourceTokens.length > 0 || alignmentResult.targetTokens.length > 0 ){
                            if( !result[`${bookName} ${chapterKey}:${verseKey}`] ){
                                result[`${bookName} ${chapterKey}:${verseKey}`] = [];
                            }
                            result[`${bookName} ${chapterKey}:${verseKey}`].push( new Alignment( new Ngram( alignmentResult.sourceTokens ), new Ngram( alignmentResult.targetTokens ) ));
                        }
                    }
                });
            }
        });
    });
    return result;
}




function loadAlignmentsAndCorpusFromUsfm( sourceFilePath: string, targetFilePath: string, bookName: string ): {alignments: {[key: string]: Alignment[]}, sourceCorpus: {[key: string]: Token[]}, targetCorpus:{[key: string]: Token[]}} {
        //Load file located at sourceFilePath to a string.
        const sourceText = fs.readFileSync( sourceFilePath ).toString();
        const targetText = fs.readFileSync( targetFilePath ).toString();
        //now push them through the usfm parser.
        const usfmSource = usfm_toJSON( sourceText, {convertToInt: ['occurrence', 'occurrences']} );
        const usfmTarget = usfm_toJSON( targetText, {convertToInt: ['occurrence', 'occurrences']} );
        //now convert it into the same dateformat the other data fetching functions produce.
    
        const targetCorpus = usfmFileToDict( usfmTarget, bookName );
        const sourceCorpus = usfmFileToDict( usfmSource, bookName );
        const alignments = usfmTargetFileToDict( usfmTarget, bookName );
    
    
        //select the first half of the keys in targetSourceLang for training.
        const midpoint = Math.floor(Object.keys(targetCorpus).length / 2);
        const trainingKeys = Object.keys(targetCorpus).slice(0, midpoint);
    
        const data = new SourceTargetData();
        data.wm_target_lang_book__train = Object.fromEntries( Object.entries(targetCorpus).filter(([key, value]) => trainingKeys.includes(key)) );
        data.wm_target_lang_book__test = Object.fromEntries( Object.entries(targetCorpus).filter(([key, value]) => !trainingKeys.includes(key)) );
        data.wm_source_lang_book = usfmFileToDict( usfmSource, bookName );
        data.wm_alignment__train = Object.fromEntries( Object.entries(alignments).filter(([key, value]) => trainingKeys.includes(key)) );
        data.wm_alignment__test = Object.fromEntries( Object.entries(alignments).filter(([key, value]) => !trainingKeys.includes(key)) );
        return {
            alignments,
            sourceCorpus,
            targetCorpus,
        };
}

function loadSourceTargetData_UsfmSource( sourceFilePath: string, targetFilePath: string, bookName: string ): SourceTargetData{
    const {alignments, sourceCorpus, targetCorpus} = loadAlignmentsAndCorpusFromUsfm( sourceFilePath, targetFilePath, bookName );

    //select the first half of the keys in targetSourceLang for training.
    const midpoint = Math.floor(Object.keys(targetCorpus).length / 2);
    const trainingKeys = Object.keys(targetCorpus).slice(0, midpoint);

    const data = new SourceTargetData();
    data.wm_target_lang_book__train = Object.fromEntries( Object.entries(targetCorpus).filter(([key, value]) => trainingKeys.includes(key)) );
    data.wm_target_lang_book__test = Object.fromEntries( Object.entries(targetCorpus).filter(([key, value]) => !trainingKeys.includes(key)) );
    data.wm_source_lang_book = sourceCorpus;
    data.wm_alignment__train = Object.fromEntries( Object.entries(alignments).filter(([key, value]) => trainingKeys.includes(key)) );
    data.wm_alignment__test = Object.fromEntries( Object.entries(alignments).filter(([key, value]) => !trainingKeys.includes(key)) );
    return data;
}

function loadSourceTargetData_SpanishRut(): SourceTargetData{
    
    return loadSourceTargetData_UsfmSource( 
        "/home/lansford/work2/Mission_Mutual/usfm/hbo_uhb/08-RUT.usfm",
        "/home/lansford/work2/Mission_Mutual/usfm/es-419_glt/08-RUT.usfm",
        "Ruth",
    );
}

function loadSourceTargetData_Rut(): SourceTargetData{
    
    return loadSourceTargetData_UsfmSource( 
        "/home/lansford/work2/Mission_Mutual/usfm/hbo_uhb/08-RUT.usfm",
        "/home/lansford/work2/Mission_Mutual/usfm/en_ult/08-RUT.usfm",
        "Ruth",
    );
}

function loadSourceTargetData_Mat_2_Tit(): SourceTargetData{
    //first load mat.
    const matLoaded = loadAlignmentsAndCorpusFromUsfm( 
        "/home/lansford/work2/Mission_Mutual/usfm/el-x-koine_ugnt/41-MAT.usfm",
        "/home/lansford/work2/Mission_Mutual/usfm/en_ult/41-MAT.usfm",
        "Mat",
    );

    //then load tit
    const titLoaded = loadAlignmentsAndCorpusFromUsfm(
         "/home/lansford/work2/Mission_Mutual/usfm/el-x-koine_ugnt/57-TIT.usfm",
         "/home/lansford/work2/Mission_Mutual/usfm/en_ult/57-TIT.usfm",
         "TIT",
    );

    const data = new SourceTargetData();
    data.wm_target_lang_book__train = matLoaded.targetCorpus;
    data.wm_target_lang_book__test  = titLoaded.targetCorpus;
    data.wm_source_lang_book = {...matLoaded.sourceCorpus, ...titLoaded.sourceCorpus};
    data.wm_alignment__train = matLoaded.alignments;
    data.wm_alignment__test = titLoaded.alignments;

    return data;
}


function parseBibleReference(reference: string): { book: string; chapter: string; verse: string } | null {
    const regex = /(?<book>([0-9]+ ?)?[a-z]+) *(?<chapter>\d+) *: *(?<verse>\d+)/i
    const match = reference.match(regex);
    return match?.groups as { book: string; chapter: string; verse: string } | null;
}

function splitLoadedMaterialByChapter( bookLoaded: {alignments: {[key: string]: Alignment[]}, sourceCorpus: {[key: string]: Token[]}, targetCorpus:{[key: string]: Token[]}}, firstOfTestingChapter: number ): {alignments: {[key: string]: Alignment[]}, sourceCorpus: {[key: string]: Token[]}, targetCorpus:{[key: string]: Token[]}}[]{
    return [
        //Training returned as index 0

        {
            alignments:   Object.fromEntries(Object.entries(bookLoaded.alignments)  .filter( ([reference,_])=> +parseBibleReference(reference).chapter < firstOfTestingChapter)),
            sourceCorpus: Object.fromEntries(Object.entries(bookLoaded.sourceCorpus).filter( ([reference,_])=> +parseBibleReference(reference).chapter < firstOfTestingChapter)),
            targetCorpus: Object.fromEntries(Object.entries(bookLoaded.targetCorpus).filter( ([reference,_])=> +parseBibleReference(reference).chapter < firstOfTestingChapter)),
        },{
            alignments:   Object.fromEntries(Object.entries(bookLoaded.alignments)  .filter( ([reference,_])=> +parseBibleReference(reference).chapter >= firstOfTestingChapter)),
            sourceCorpus: Object.fromEntries(Object.entries(bookLoaded.sourceCorpus).filter( ([reference,_])=> +parseBibleReference(reference).chapter >= firstOfTestingChapter)),
            targetCorpus: Object.fromEntries(Object.entries(bookLoaded.targetCorpus).filter( ([reference,_])=> +parseBibleReference(reference).chapter >= firstOfTestingChapter)),
        },

    ]

}

function loadSourceTargetData_Spanish3JN_n_Tit12_2_Tit3(): SourceTargetData{
    //first load mat.
    const _3jnLoaded = loadAlignmentsAndCorpusFromUsfm( 
        "/home/lansford/work2/Mission_Mutual/usfm/el-x-koine_ugnt/65-3JN.usfm",
        "/home/lansford/work2/Mission_Mutual/usfm/es-419_glt/65-3JN.usfm",
        "3JN",
    );

    //then load tit
    const titLoaded = loadAlignmentsAndCorpusFromUsfm(
         "/home/lansford/work2/Mission_Mutual/usfm/el-x-koine_ugnt/57-TIT.usfm",
         "/home/lansford/work2/Mission_Mutual/usfm/es-419_glt/57-TIT.usfm",
         "TIT",
    );

    //split chapters 1 and 2 out from chapter 3
    const titSplit = splitLoadedMaterialByChapter( titLoaded, 3 );

    const data = new SourceTargetData();
    data.wm_target_lang_book__train = {..._3jnLoaded.targetCorpus, ...titSplit[0].targetCorpus};
    data.wm_target_lang_book__test  = titSplit[1].targetCorpus;
    data.wm_source_lang_book = {..._3jnLoaded.sourceCorpus, ...titLoaded.sourceCorpus};
    data.wm_alignment__train = {..._3jnLoaded.alignments, ...titSplit[0].alignments};
    data.wm_alignment__test = titSplit[1].alignments;

    return data;
}

function loadSourceTargetData_Gen_2_Rut(): SourceTargetData{
    //first load gen
    const genLoaded = loadAlignmentsAndCorpusFromUsfm(
        "/home/lansford/work2/Mission_Mutual/usfm/hbo_uhb/01-GEN.usfm",
        "/home/lansford/work2/Mission_Mutual/usfm/en_ult/01-GEN.usfm",
        "GEN",
    )

    //then load rut
    const rutLoaded = loadAlignmentsAndCorpusFromUsfm(
        "/home/lansford/work2/Mission_Mutual/usfm/hbo_uhb/08-RUT.usfm",
        "/home/lansford/work2/Mission_Mutual/usfm/en_ult/08-RUT.usfm",
        "RUT",
    )

    const data = new SourceTargetData();
    data.wm_target_lang_book__train = genLoaded.targetCorpus;
    data.wm_target_lang_book__test  = rutLoaded.targetCorpus;
    data.wm_source_lang_book = {...genLoaded.sourceCorpus, ...rutLoaded.sourceCorpus};
    data.wm_alignment__train = genLoaded.alignments;
    data.wm_alignment__test = rutLoaded.alignments;

    return data;
}

function loadSourceTargetData_Gen(): SourceTargetData{
    const tc_alignment = recursive_json_load( "/home/lansford/translationCore/projects/en_ult_gen_book/.apps/translationCore/alignmentData/gen")

    //here is gen
    const tc_target_lang_book  = recursive_json_load( "/home/lansford/translationCore/projects/en_ult_gen_book/gen" );
    const tc_source_lang_book  = recursive_json_load( "/home/lansford/work2/Mission_Mutual/translationCore/tcResources/hbo/bibles/uhb/v2.1.30_Door43-Catalog/books.zip" ).gen

    //Hack these lemmas to be the same until I have further instruction.
    //Them being different while the word is the same resulting in a 2 of 1 occurrence which bombs
    //wordmap.
    tc_source_lang_book[47][20].verseObjects[10].lemma = tc_source_lang_book[47][20].verseObjects[18].lemma


    //only up to 47 is manually aligned in the data.
    const tc_target_lang_book__test = Object.fromEntries( Object.entries( tc_target_lang_book).filter(([key, value]) => !isNaN(Number(key)) && parseInt(key) <= 43 ) );
    const tc_target_lang_book__train = Object.fromEntries( Object.entries( tc_target_lang_book).filter(([key, value]) => !isNaN(Number(key)) && parseInt(key) > 43 && parseInt(key) <= 47 ) );

    const bookName: string = "gen";
    const data = new SourceTargetData();
    data.wm_target_lang_book__train = convert_tc_to_token_dict( bookName, tc_target_lang_book__train, false );
    data.wm_target_lang_book__test  = convert_tc_to_token_dict( bookName, tc_target_lang_book__test,  false );
    data.wm_source_lang_book = convert_tc_to_token_dict( bookName, tc_source_lang_book, true );
    data.wm_alignment__train = convert_alignment_to_alignment_dict( bookName, tc_alignment, data.wm_source_lang_book, data.wm_target_lang_book__train);
    data.wm_alignment__test = convert_alignment_to_alignment_dict( bookName, tc_alignment, data.wm_source_lang_book, data.wm_target_lang_book__test);

    return data;
}


function grade_highlighting_method(
    data: SourceTargetData,
    output_csv: WriteStream, //output_stream
    predict_method: ( from_tokens: Token[], to_tokens: Token[] ) => Suggestion[], //mapping_function
){
    //So in this grading method I am going to reimplement what I did in the SuggestingWordAligner dialog which would highlight different 
    //target words with different confidence levels depending on what suggestions came back from the suggester.  Now if it hits multiple output words,
    //I will give it a partial score depending on how many of them are a hit or miss.
    //Each row of the output csv will be a different target token, so that we can have the correlation between the confidence and correctness.
    //This way we can see if we limit our prediction based on a confidence threshold if we can maintain a given correctness threshold.

    output_csv.write( "verseKey,target_token,verse_confidence,token_confidence,correctness\n");

    Object.keys(data.wm_target_lang_book__test).forEach( verseKey => {
        if( verseKey in data.wm_source_lang_book ){
            const targetTokens = data.wm_target_lang_book__test[verseKey];
            const sourceTokens = data.wm_source_lang_book[verseKey];

            const suggestion : Suggestion = predict_method( sourceTokens, targetTokens )[0];

            const verse_confidence = suggestion.compoundConfidence();

            //hash out the suggested source tokens from target tokens in a dictionary so it is easier to look up.
            const suggestedTargetHashToSourceTokens : { [key: string]: Token[] } = {};
            const suggestedTargetHashToConfidence   : { [key: string]: number } = {};
            suggestion.getPredictions().forEach( prediction => {
                prediction.alignment.targetNgram.getTokens().forEach( targetToken => {
                    const targetTokenHash = token_to_hash( targetToken );
                    prediction.alignment.sourceNgram.getTokens().forEach( sourceToken => {
                        if( !(targetTokenHash in suggestedTargetHashToSourceTokens) ){
                            suggestedTargetHashToSourceTokens[ targetTokenHash ] = [];
                            suggestedTargetHashToConfidence[ targetTokenHash ] = 0;
                        }
                        suggestedTargetHashToSourceTokens[ targetTokenHash ].push( sourceToken );
                        suggestedTargetHashToConfidence[ targetTokenHash ] = Math.max( suggestedTargetHashToConfidence[ targetTokenHash ], prediction.confidence );
                    });
                });
            });

            //now hash out the actual source tokens from the target tokens in a dictionary so it is easier to look up.
            const actualTargetHashToSourceTokens : { [key: string]: Token[] } = {};
            data.wm_alignment__test[verseKey].forEach( alignment => {
                alignment.targetNgram.getTokens().forEach( targetToken => {
                    const targetTokenHash = token_to_hash( targetToken );
                    alignment.sourceNgram.getTokens().forEach( sourceToken => {
                        if( !(targetTokenHash in actualTargetHashToSourceTokens) ) actualTargetHashToSourceTokens[ targetTokenHash ] = [];
                        actualTargetHashToSourceTokens[ targetTokenHash ].push( sourceToken );
                    });
                });
            })

            //Iterate through each target token and write out its confidence and score.
            for( let targetToken_i = 0; targetToken_i < targetTokens.length; ++targetToken_i ){
                const targetToken = targetTokens[targetToken_i];
                const targetTokenHash = token_to_hash( targetToken );

                const suggestedSourceTokens = suggestedTargetHashToSourceTokens[ targetTokenHash ] || [];
                const actualSourceTokens = actualTargetHashToSourceTokens[ targetTokenHash ] || [];

                const numSuggestedSourceTokens = suggestedSourceTokens.length;

                const token_confidence = suggestedTargetHashToConfidence[ targetTokenHash ];

                //Don't output if there were not any suggestions because this shouldn't count as figuring out if the confidence is valid.
                if( numSuggestedSourceTokens > 0 ){

                    let numCorrectlySuggestedSourceTokens = 0;

                    for( let suggestedSourceToken_i = 0; suggestedSourceToken_i < numSuggestedSourceTokens; ++suggestedSourceToken_i ){
                        const suggestedSourceToken = suggestedSourceTokens[suggestedSourceToken_i];

                        //now see if this source token is in the actual source tokens.
                        const actualSourceToken = actualSourceTokens.find( actualSourceToken => token_to_hash( actualSourceToken ) === token_to_hash( suggestedSourceToken ) );
                        if( actualSourceToken ){
                            ++numCorrectlySuggestedSourceTokens;
                        }
                    }


                    const score = numCorrectlySuggestedSourceTokens / numSuggestedSourceTokens;
                    output_csv.write(
                        //verseKey  ,target_token  ,confidence,correctness,suggestions
                        `${verseKey},${targetToken},${verse_confidence},${token_confidence},${score}\n`
                    );
                }
            }

        }
    });
}



//const boostMap = new CatBoostWordMap({ targetNgramLength: 5, warnings: false });
//const boostMap = new MorphCatBoostWordMap({ targetNgramLength: 5, warnings: false });

function run_catboost_test_with_alignment_adding_method( data: SourceTargetData, boostMap: AbstractWordMapWrapper, number_suffix: string, alignment_adder: (source_text: {[key: string]: Token[]}, target_text: {[key: string]: Token[]}, alignments: {[key: string]: Alignment[] }) => Promise<void>, use_corpus: boolean){

    //If this test uses corpus, then add all the corpus.  Test and train.  
    //The reason we use test along with the train is that in the use case scenario which we
    //care about we can use the unaligned data as corpus as well.
    if( use_corpus ){
        const sourceTokens : Token[][] = [];
        const targetTokens : Token[][] = [];
        Object.entries(data.wm_target_lang_book__test!).forEach( ([verseKey, verseTokens]: [string, Token[]]) => {
            if( verseKey in data.wm_source_lang_book ){
                targetTokens.push( verseTokens );
                sourceTokens.push( data.wm_source_lang_book[verseKey] );
            }
        });
        Object.entries(data.wm_target_lang_book__train!).forEach( ([verseKey, verseTokens]: [string, Token[]]) => {
            if( verseKey in  data.wm_source_lang_book ){
                targetTokens.push( verseTokens );
                sourceTokens.push( data.wm_source_lang_book[verseKey] );
            }
        });
        boostMap.appendCorpusTokens( sourceTokens, targetTokens );
    }

    alignment_adder.call( boostMap, data.wm_source_lang_book, data.wm_target_lang_book__train, data.wm_alignment__train ).then(() => {


        const output_csv = createWriteStream( `dev_scripts/data/book_split_catboost_${number_suffix}${use_corpus?"_with_corpus":""}.csv` );




        //function plane_wordmap_method( from_tokens: Token[], to_tokens: Token[] ) => Suggestion[]{
            // return word_map_predict_tokens( map, from_tokens, to_tokens );
        //}
        const predict_method = function( from_tokens: Token[], to_tokens: Token[] ): Suggestion[]{
            return boostMap.predict( from_tokens, to_tokens );
        }

        grade_mapping_method( 
            data.wm_source_lang_book, //source_sentence_tokens_dict
            data.wm_target_lang_book__test, //target_sentence_tokens_dict
            data.wm_alignment__test, //manual_mappings_dict
            output_csv, //output_stream
            predict_method //mapping_function
            )
            output_csv.end();

        const output_csv2 = createWriteStream( `dev_scripts/data/highlight_grade_${number_suffix}${use_corpus?"_with_corpus":""}.csv` );

        grade_highlighting_method(
            data,
            output_csv2, //output_stream
            predict_method, //mapping_function
        )
        output_csv2.end();

        console.log( "done" );
    });
}

function run_configurable_wordmap_test( alignment_adding_method: number, boost_type: string, lang_selections: string, ratio_of_training_data: number, use_corpus: boolean = false ){
    const boostMap = (boost_type === "morph_jlboost")? new MorphJLBoostWordMap    ({ targetNgramLength: 5, warnings: false, forceOccurrenceOrder:false }):
                     (boost_type === "jlboost"    )?  new JLBoostWordMap         ({ targetNgramLength: 5, warnings: false, forceOccurrenceOrder:false }):
                     (boost_type === "first_letter")? new FirstLetterBoostWordMap({ targetNgramLength: 5, warnings: false, forceOccurrenceOrder:false }):
                     (boost_type === "plane"      )?  new PlaneWordMap           ({ targetNgramLength: 5, warnings: false, forceOccurrenceOrder:false }):
                     (boost_type === "morph_boost")?  new MorphCatBoostWordMap   ({ targetNgramLength: 5, warnings: false, forceOccurrenceOrder:false }):
                   /*(boost_type === "boost"      )?*/new CatBoostWordMap        ({ targetNgramLength: 5, warnings: false, forceOccurrenceOrder:false });

    boostMap.setTrainingRatio( ratio_of_training_data );

    if( alignment_adding_method > 4 ) alignment_adding_method = 4;
    
    const add_alignment_method = alignment_adding_method == 1 ?   boostMap.add_alignments_1:
                                 alignment_adding_method == 2 ?   boostMap.add_alignments_2:
                                 alignment_adding_method == 3 ?   boostMap.add_alignments_3:
                              /* alignment_adding_method == 4 ?*/ boostMap.add_alignments_4;

    const selected_data = lang_selections == "greek-spanish-tit" ? loadSourceTargetData_SpanishTit():
                          lang_selections == "greek-english-mat" ? loadSourceTargetData_Mat():
                          lang_selections == "greek-english-tit" ? loadSourceTargetData_Tit():
                          lang_selections == "heb-spanish-rut" ? loadSourceTargetData_SpanishRut():
                          lang_selections == "heb-english-rut" ? loadSourceTargetData_Rut():
                          lang_selections == "greek-english-mat-2-tit" ? loadSourceTargetData_Mat_2_Tit():
                          lang_selections == "greek-spanish-3JN_n_Tit12_2_Tit3" ? loadSourceTargetData_Spanish3JN_n_Tit12_2_Tit3():
                          lang_selections == "heb-english-gen" ? loadSourceTargetData_Gen():
                          lang_selections == "heb-english-gen-2-rut" ? loadSourceTargetData_Gen_2_Rut():
                                                                undefined;
                       

    //tokens need location information.  Who would have thunk it?
    Object.values(selected_data.wm_source_lang_book).forEach( tokens => updateTokenLocations(tokens) );
    Object.values(selected_data.wm_target_lang_book__train).forEach( tokens => updateTokenLocations(tokens) );
    Object.values(selected_data.wm_target_lang_book__test).forEach( tokens => updateTokenLocations(tokens) );

    let csv_code : string = `${alignment_adding_method}_${boost_type}_${lang_selections}`;


    run_catboost_test_with_alignment_adding_method( selected_data, boostMap, csv_code, add_alignment_method, use_corpus );
}

if (require.main === module) {
    // run_configurable_wordmap_test( 2, "plane", "heb-english-gen", .1 )
    //run_configurable_wordmap_test( 2, "morph_boost", "heb-english-gen", .1 )
    //run_configurable_wordmap_test( 2, "boost", "heb-english-gen", .1 )
    // run_configurable_wordmap_test( 2, "morph_boost", "greek-english-mat", .9 )
    // run_configurable_wordmap_test( 2, "boost", "greek-english-mat", .9 )

    //run_configurable_wordmap_test( 2, "first_letter", "heb-english-gen", .1 )
    //run_configurable_wordmap_test( 2, "first_letter", "greek-english-mat", 1 )

    //run_configurable_wordmap_test( 2, "plane", "greek-spanish-tit", 1 )
    // run_configurable_wordmap_test( 2, "morph_boost", "greek-spanish-tit", 1 )
    // run_configurable_wordmap_test( 2, "boost", "greek-spanish-tit", 1 )
    //run_configurable_wordmap_test( 2, "first_letter", "greek-spanish-tit", 1 )
    //run_configurable_wordmap_test( 2, "jlboost", "greek-english-mat", .9 )
    //run_configurable_wordmap_test( 4, "jlboost", "greek-spanish-tit", 1 )
    //run_configurable_wordmap_test( 2, "jlboost", "heb-english-gen", 1, true )
    //run_configurable_wordmap_test( 2, "morph_jlboost", "greek-spanish-tit", 1, false )
    //run_configurable_wordmap_test( 2, "morph_jlboost", "greek-spanish-tit", 1, true )

    //run_configurable_wordmap_test( 2, "morph_jlboost", "heb-english-gen", 1 )

    //run_configurable_wordmap_test( 2, "morph_jlboost", "heb-english-gen", 1, true )
    //run_configurable_wordmap_test( 2, "morph_jlboost", "heb-english-gen", 1 )

    //console.log( "doing morph_jlboost titus" );
    //run_configurable_wordmap_test( 2, "morph_jlboost", "greek-spanish-tit", 1, true )
    //console.log( "doing morph_jlboost mat" );
    //run_configurable_wordmap_test( 4, "morph_jlboost", "greek-english-mat", 1, true )
    //console.log( "doing morph_boost" );
    //run_configurable_wordmap_test( 2, "morph_boost", "greek-english-mat", 1, true )
    // console.log( "doing first_letter" );
    // run_configurable_wordmap_test( 2, "first_letter", "greek-english-mat", 1, true )
    //console.log( "done" );


    //run_configurable_wordmap_test( 2, "morph_jlboost", "greek-english-tit", 1, true )
    //run_configurable_wordmap_test( 4, "morph_jlboost", "greek-english-tit", 1, true )


    run_configurable_wordmap_test( 2, "morph_jlboost", "heb-english-gen", 1, true )
    //run_configurable_wordmap_test( 2, "morph_jlboost", "heb-spanish-rut", 1, true )
    //run_configurable_wordmap_test( 2, "morph_jlboost", "heb-english-rut", 1, true )

    //run_configurable_wordmap_test( 2, "morph_jlboost", "greek-english-mat-2-tit", 1, true )

    //run_configurable_wordmap_test( 2, "morph_jlboost", "greek-spanish-3JN_n_Tit12_2_Tit3", 1, true )

    //run_configurable_wordmap_test( 2, "morph_jlboost", "heb-english-rut", 1, true )

    //run_configurable_wordmap_test( 2, "morph_jlboost", "heb-english-gen-2-rut", 1, true )
}
