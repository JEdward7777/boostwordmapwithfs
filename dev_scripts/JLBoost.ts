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
    xy_data: IDataFrame, 
    num_levels: number,
    y_index: string,
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

    predict(xy_data: IDataFrame): ISeries {
        return xy_data.select( row => {
            return {
                result:this.predict_single(row)
            };
        } ).getSeries('result');
    }

    random_tree({
        xy_data,
        num_levels,
        y_index,
        ignored_categories
    }:TreeBranch__random_tree__NamedParameters ): TreeBranch {
        const categories = xy_data.getColumnNames().filter(
            (category) => category !== y_index && !ignored_categories.includes(category)
        );
        //Randomly select a category
        const randomCategoryIndex = Math.floor(Math.random() * categories.length);
        this.feature_index = categories[randomCategoryIndex];

        const length = xy_data.count();
        const first_of_right_hand = Math.min(
            Math.max(Math.floor(Math.random() * length), 1),
            length - 1
        );

        // Sort the section by the selected feature index
        const xy_data_sorted = xy_data
            .orderBy((row)=>row[this.feature_index]).resetIndex();


        //determine our split value from the randomly hit split location.
        this.split_value =
            0.5 *
            (xy_data_sorted.at(first_of_right_hand - 1)[this.feature_index] +
             xy_data_sorted.at(first_of_right_hand)[this.feature_index]);

        if (num_levels > 1) {
            if (first_of_right_hand > 1) {
                this.left_side = new TreeBranch().random_tree({
                    ignored_categories: [],
                    xy_data:xy_data_sorted.between(0,first_of_right_hand-1),
                    num_levels: num_levels - 1,
                    y_index,
                });
            } else {
                this.left_side = new TreeLeaf(
                    xy_data_sorted.getSeries(y_index).between(0,first_of_right_hand-1).average()
                );
            }

            if (length - first_of_right_hand > 1) {
                this.right_side = new TreeBranch().random_tree({
                    ignored_categories: [],
                    xy_data:xy_data_sorted.between(first_of_right_hand,length-1),
                    num_levels: num_levels - 1,
                    y_index
                });
            } else {
                this.right_side = new TreeLeaf(
                    xy_data_sorted.getSeries(y_index).between(first_of_right_hand,length - 1).average()
                );
            }
        } else {
            this.left_side = new TreeLeaf(
                xy_data_sorted.getSeries(y_index).between(0,first_of_right_hand-1).average()
            );
            this.right_side = new TreeLeaf(
                xy_data_sorted.getSeries(y_index).between(first_of_right_hand,length - 1).average()
            );
        }

        return this;
    }
}

interface JLBoost__train__NamedParamaters {
    xy_data: IDataFrame, // Replace 'any' with the appropriate type for xy_data
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

    predict(xy_data: IDataFrame ): any {
        let output: any = Array(xy_data.count()).fill(0);

        for (const tree of this.trees) {
            const treePrediction = tree.predict(xy_data)
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
        xy_data,
        y_index = 'y',
        n_steps = 1000,
        tree_depth = 2,
        talk = true,
    }: JLBoost__train__NamedParamaters ): JLBoost {


        let current_output = this.predict(xy_data);

        let ignored_categories: string[] = [];
        let last_loss: number | null = null;

        for (let n = 0; n < n_steps; n++) {
            const adjusted_data = xy_data.withSeries(y_index, 
                xy_data.select( (row,row_n) => row[y_index] - current_output.at(row_n) ) as any
            )

            //const adjusted_data_ptr = [new DataFrame(xy_data_ptr[0])];
            //adjusted_data_ptr[y_index] = xy_data[y_index] - current_output;

            const new_tree = new TreeBranch();
            new_tree.random_tree({
                num_levels: tree_depth,
                ignored_categories: ignored_categories,
                xy_data: adjusted_data,
                y_index: y_index
            });

            const new_tree_output = new_tree.predict( xy_data );
            const new_output = current_output.map((value: number, index: number) => {
                return value + new_tree_output.at(index) * this.learning_rate;
            });

            //const new_loss = Math.stdDev(xy_data[y_index] - new_output);
            const new_loss = xy_data.getSeries(y_index).select( (target,n) => new_output[n]-target ).std();

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

    model.train( {xy_data: test_dataframe, y_index:'y', n_steps:3000, tree_depth:4, talk:true })

    const model_results = model.predict( test_dataframe );

    const with_prediction = test_dataframe.withSeries( "prediction", new Series(model_results) )
                            .withSeries( "diff", (df) => df.select( (r) => r.prediction - r.y ) as any );


    console.log( with_prediction.toString() );
}