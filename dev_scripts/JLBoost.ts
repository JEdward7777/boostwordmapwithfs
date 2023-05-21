import { DataFrame, IDataFrame, ISeries, Series } from "data-forge";

let range = (n: number, offset: number) =>
  Array.from(Array(n).keys()).map((n) => n + offset);

class TreeLeaf {
    private average: number;

    constructor(average: number) {
        this.average = average;
    }

    predict(xyData: any): number {
        return this.average;
    }

    predict_single(data: {[key: number]:any}): number {
        return this.average;
    }

}

const MIDDLE_SPLIT_FAVOR: number = 0.25;

interface TreeBranch__random_tree__NamedParameters{
    xy_data_ptr: IDataFrame[], 
    num_levels: number,
    y_index: string,
    index_start: number,
    index_after_end: number,
    ignored_categories: string[]
}

class TreeBranch {
    private left_side: TreeBranch | TreeLeaf | null;
    private right_side: TreeBranch | TreeLeaf | null;
    public feature_index: string | null;
    public split_value: any | null;

    constructor() {
        this.left_side = null;
        this.right_side = null;
        this.feature_index = null;
        this.split_value = null;
    }

    predict_single( data: {[key: string]:number}): number {
        return (data[this.feature_index] > this.split_value)?
                    this.right_side.predict_single(data):
                    this.left_side.predict_single(data);
    }

    predict(xy_data_ptr: IDataFrame[]): ISeries {
        return xy_data_ptr[0].select( row => {
            return {
                result:this.predict_single(row)
            };
        } ).getSeries('result');
    }

    random_tree({
        xy_data_ptr,
        num_levels,
        y_index,
        index_start,
        index_after_end,
        ignored_categories
    }:TreeBranch__random_tree__NamedParameters ): TreeBranch {
        const categories = xy_data_ptr[0].getColumnNames().filter(
            (category) => category !== y_index && !ignored_categories.includes(category)
        );
        //Randomly select a category
        const randomCategoryIndex = Math.floor(Math.random() * categories.length);
        this.feature_index = categories[randomCategoryIndex];

        const length = index_after_end - index_start;
        const first_of_right_hand = Math.min(
            Math.max(Math.floor(Math.random() * length), 1),
            length - 1
        ) + index_start;

        // Sort the section by the selected feature index
        const sorted_sub_range = xy_data_ptr[0]
            .between(index_start,index_after_end-1)
            .orderBy((row)=>row[this.feature_index])
            .withIndex(range(index_after_end-index_start,index_start));
        //now replace the original data with the data with the sorted subrange baked back in.
        xy_data_ptr[0] = DataFrame.merge([xy_data_ptr[0],sorted_sub_range])

        //determine our split value from the randomly hit split location.
        this.split_value =
            0.5 *
            (xy_data_ptr[0].at(first_of_right_hand - 1)[this.feature_index] +
                xy_data_ptr[0].at(first_of_right_hand)[this.feature_index]);

        if (num_levels > 1) {
            if (first_of_right_hand - index_start > 1) {
                this.left_side = new TreeBranch().random_tree({
                    ignored_categories: [],
                    xy_data_ptr,
                    num_levels: num_levels - 1,
                    y_index,
                    index_start,
                    index_after_end: first_of_right_hand,
                });
            } else {
                this.left_side = new TreeLeaf(
                    xy_data_ptr[0].getSeries(y_index).between(index_start,first_of_right_hand-1).average()
                );
            }

            if (index_after_end - first_of_right_hand > 1) {
                this.right_side = new TreeBranch().random_tree({
                    ignored_categories: [],
                    xy_data_ptr,
                    num_levels: num_levels - 1,
                    y_index,
                    index_start: first_of_right_hand,
                    index_after_end,
                });
            } else {
                this.right_side = new TreeLeaf(
                    xy_data_ptr[0].getSeries(y_index).between(first_of_right_hand,index_after_end - 1).average()
                );
            }
        } else {
            this.left_side = new TreeLeaf(
                xy_data_ptr[0].getSeries(y_index).between(index_start,first_of_right_hand-1).average()
            );
            this.right_side = new TreeLeaf(
                xy_data_ptr[0].getSeries(y_index).between(first_of_right_hand,index_after_end - 1).average()
            );
        }

        return this;
    }
}

interface JLBoost__train__NamedParamaters {
    xy_data_ptr: IDataFrame[], // Replace 'any' with the appropriate type for xy_data
    y_index: string,
    n_steps: number,
    tree_depth: number,
    talk: boolean,
}
export class JLBoost {
    trees: TreeBranch[];
    learning_rate: number;

    constructor(learning_rate = 0.07) {
        this.trees = [];
        this.learning_rate = learning_rate;
    }

    predict(xy_data_ptr: IDataFrame[] ): any {
        let output: any = Array(xy_data_ptr[0].count()).fill(0);

        for (const tree of this.trees) {
            const treePrediction = tree.predict(xy_data_ptr)
            output = output.map((value: number, index: number) => {
                return value + treePrediction.at(index) * this.learning_rate;
            });
        }
        return output;
    }

    predict_single( data: {[key: string]:number} ): number{
        let output: number = 0;

        for( const tree of this.trees){
            const treePrediction = tree.predict_single( data )
            output += treePrediction * this.learning_rate;
        }

        return output;
    }


    train({
        xy_data_ptr,
        y_index = 'y',
        n_steps = 1000,
        tree_depth = 2,
        talk = true,
    }: JLBoost__train__NamedParamaters ): JLBoost {


        let current_output = this.predict(xy_data_ptr);

        let ignored_categories: string[] = [];
        let last_loss: number | null = null;

        for (let n = 0; n < n_steps; n++) {
            const adjusted_data_ptr = [ xy_data_ptr[0].withSeries(y_index, 
                xy_data_ptr[0].select( (row,row_n) => row[y_index] - current_output.at(row_n) ) as any
            )]

            //const adjusted_data_ptr = [new DataFrame(xy_data_ptr[0])];
            //adjusted_data_ptr[y_index] = xy_data[y_index] - current_output;

            const new_tree = new TreeBranch();
            new_tree.random_tree({
                num_levels: tree_depth,
                ignored_categories: ignored_categories,
                xy_data_ptr: adjusted_data_ptr,
                y_index: y_index,
                index_start: 0,
                index_after_end: adjusted_data_ptr[0].count(),
            });

            const new_tree_output = new_tree.predict( xy_data_ptr );
            const new_output = current_output.map((value: number, index: number) => {
                return value + new_tree_output.at(index) * this.learning_rate;
            });

            //const new_loss = Math.stdDev(xy_data[y_index] - new_output);
            const new_loss = xy_data_ptr[0].getSeries(y_index).select( (target,n) => new_output[n]-target ).std();

            ignored_categories = [new_tree.feature_index];

            if (last_loss === null || new_loss < last_loss) {
                this.trees.push(new_tree);
                last_loss = new_loss;
                current_output = new_output;

                if (talk) {
                    console.log(
                        `Step ${n}: Output  ${new_loss}  split on ${new_tree.feature_index} at ${new_tree.split_value}`
                    );
                }

            } else {
                if (talk) {
                    console.log(
                        `Step ${n}: Output [${new_loss}] split on ${new_tree.feature_index} at ${new_tree.split_value} --rejected`
                    );
                }
            }
        }
        return this;
    }
}

if (require.main === module) {
    //Do some tests of the module

    const test_dataframe = new DataFrame([
        { 'gender':0, 'age':2,  'y':0 },
        { 'gender':1, 'age':3,  'y':0 },
        { 'gender':0, 'age':6,  'y':0 },
        { 'gender':1, 'age':7,  'y':0 },
        { 'gender':1, 'age':9,  'y':0 },
        { 'gender':0, 'age':12, 'y':.1 },
        { 'gender':0, 'age':15, 'y':.3 },
        { 'gender':1, 'age':16, 'y':9 },
        { 'gender':0, 'age':16, 'y':1 },
        { 'gender':0, 'age':18, 'y':10 },
        { 'gender':1, 'age':18, 'y':8 },
        { 'gender':0, 'age':20, 'y':7 },
        { 'gender':0, 'age':21, 'y':7 },
        { 'gender':0, 'age':23, 'y':7 },
        { 'gender':1, 'age':26, 'y':4 },
        { 'gender':0, 'age':27, 'y':4 },
        { 'gender':1, 'age':29, 'y':2 },
        { 'gender':1, 'age':30, 'y':1 },
        { 'gender':0, 'age':40, 'y':1 },
        { 'gender':0, 'age':100, 'y':10 },
        { 'gender':1, 'age':100, 'y':9 },
    ]);

    const model = new JLBoost();

    model.train( {xy_data_ptr: [test_dataframe], y_index:'y', n_steps:3000, tree_depth:4, talk:true })

    const model_results = model.predict( [test_dataframe] );

    const with_prediction = test_dataframe.withSeries( "prediction", new Series(model_results) )
                            .withSeries( "diff", (df) => df.select( (r) => r.prediction - r.y ) as any );


    console.log( with_prediction.toString() );
}