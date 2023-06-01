 import {recursive_json_load, saveJson} from "../src/json_tools";
import {ChapterVerse, add_book_alignment_to_wordmap, extract_alignment_frequency, compile_verse_text_pair,
    convert_tc_to_token_dict, convert_alignment_to_alignment_dict, grade_mapping_method,
    word_map_predict_tokens} from "../src/wordmap_tools";
import WordMap, {Suggestion,Alignment} from "wordmap";
import { createWriteStream } from 'fs';
import {Token} from "wordmap-lexer";
import {PlaneWordMap, CatBoostWordMap, MorphCatBoostWordMap, FirstLetterBoostWordMap, JLBoostWordMap, JLBoostMultiWordMap, JLBoostMultiWordMap2 } from "../src/boostwordmap_tools";


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

//const boostMap = new CatBoostWordMap({ targetNgramLength: 5, warnings: false });
//const boostMap = new MorphCatBoostWordMap({ targetNgramLength: 5, warnings: false });

function run_catboost_test_with_alignment_adding_method( data: SourceTargetData, boostMap: PlaneWordMap, number_suffix: string, alignment_adder: (source_text: {[key: string]: Token[]}, target_text: {[key: string]: Token[]}, alignments: {[key: string]: Alignment[] }) => Promise<void>){


    alignment_adder.call( boostMap, data.wm_source_lang_book, data.wm_target_lang_book__train, data.wm_alignment__train ).then(() => {

        const output_csv = createWriteStream( `dev_scripts/data/book_split_catboost_${number_suffix}.csv` );

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


        console.log( "done" );
    });
}

function run_configurable_wordmap_test( alignment_adding_method: number, boost_type: string, lang_selections: string, ratio_of_training_data: number ){
    const boostMap = (boost_type === "jlboostmwm2" )? new JLBoostMultiWordMap2   ({ targetNgramLength: 5, warnings: false, forceOccurrenceOrder:false }):
                     (boost_type === "jlboostmwm" )?  new JLBoostMultiWordMap    ({ targetNgramLength: 5, warnings: false, forceOccurrenceOrder:false }):
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
                        /*lang_selections == "heb-english-gen" ? */loadSourceTargetData_Gen();

    let csv_code : string = `${alignment_adding_method}_${boost_type}_${lang_selections}`;


    run_catboost_test_with_alignment_adding_method( selected_data, boostMap, csv_code, add_alignment_method );
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
    //run_configurable_wordmap_test( 2, "jlboost", "heb-english-gen", 1 )
    run_configurable_wordmap_test( 2, "jlboostmwm2", "heb-english-gen", 1 )
    //run_configurable_wordmap_test( 2, "jlboostmwm", "greek-spanish-tit", 1 )
    //run_configurable_wordmap_test( 2, "jlboostmwm2", "greek-spanish-tit", 1 )
}