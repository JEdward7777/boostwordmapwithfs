# boostwordmapwithfs
This project used to be one and the same with [wordmapbooster](https://github.com/JEdward7777/wordmapbooster), however as wordmapbooster needed to be used as a library used in the browser, the repo couldn't be contaminated with the node fs library.  So the pieces of the library which used fs were broken off into this as a separate library.

This library provides node based testing of wordmapbooster and also compares it with other non browser based technologies such as [catboost](https://catboost.ai/).

## Usage
The main file which runs the different tests with different permutations is [run_alignment_tests.ts](https://github.com/JEdward7777/boostwordmapwithfs/blob/master/dev_scripts/run_alignment_tests.ts).  At the very bottom of the file is several invocations of `run_configurable_wordmap_test` with different parameters specifying different combinations of the test.  The arguments to `run_configurable_wordmap_test` are the following:
- `alignment_adding_method: number` This is a number [1-4] of what `add_alignments_#` method should be used.  Testing has shown that methods 2 and 4 work and 1 and 3 do not.  4 works best if you have very little data.
- `boost_type: string` This specifies the type of boost algorithm.  `MorphJLBoostWordMap` is `morph_jlboost` and `JLBoostWordMap` is `jlboost`.  There are other options as well, you milage may vary getting them to work.
- `lang_selections: string` This specifies which selection of aligned scripture should be used in the test.  Most of them load data from [TranslationCore](https://github.com/unfoldingWord/translationCore) project format.  If you trace down the `heb-english-gen-2-rut` it shows you how to load data from usfm alignments.
- `ratio_of_training_data: number` This is a number between [1-0) which specify how much of the collected data is actually used to train the boost model.  If the test uses too much data and the model is breaking setting this to a number less then one will help.
- `use_corpus: boolean` This boolean allows testing if using corpus helps with training or not.  The result is that it does.

Once the test is run there will be two output csv files in the `/dev_scripts/data` folder one that starts with `book_split` and one that starts with `highlight_grade`.  The csv file which starts with `book_split` gives information on how well the full n-gram predictions match the expected results.  The csv file which starts with `highlight_grade` scores each individual target token's source pair and gives it is own grade.  It is given a 100% score if all the words it is mapped to are or are a subset of the correct source n-gram which is part of that target token.  This test is for determining the effectiveness of using predictions when dragging and dropping one target word at a time without being concerned about getting the entire n-gram correct as long as it doesn't suggest an error.

## System setup
I am running with node version `v18.16.0`.  The [vscode configuration](https://github.com/JEdward7777/boostwordmapwithfs/blob/master/.vscode/launch.json) is checked into this repo.  The run configuration `"TypeScript: Current File"` is useful for running the [run_alignment_tests.ts](https://github.com/JEdward7777/boostwordmapwithfs/blob/master/dev_scripts/run_alignment_tests.ts) file mentioned above.
