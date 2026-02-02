---
order: 2
id: 1
title: Article demos
---

# Block quote demo

"async-primitives":
A collection of primitive functions for asynchronous operations in TypeScript/JavaScript.

> If you are interested in performing additional calculations on Promise<T>, you may find this small library useful. Mutex, producer-consumer separation (side-effect operation), signaling (flag control), logical context and more.
>
> - Works in both browser and Node.js environments (16 or later, tested only 22).
> - No external dependencies.

# Code block demo

Writing the whole operation in code gives a minimal example like this:

```typescript
const run = async (
  script: string,
  logs: FunCityLogEntry[] = []
): Promise<string> => {
  // Run the tokenizer
  const blocks: FunCityToken[] = runTokenizer(script, logs);

  // :
  // :
  // :

  const text: string = results.join('');
  return text;
};
```

“The core” of the core engine is truly concentrated in this code:

- The reducer's output is raw computational results.
  Multiple results may also be obtained.
  Therefore, these are concatenated as strings to produce the final output text.
- If a script does not change once loaded and you want to run only the reducer many times,
  you can run the tokenizer and parser up front, then execute only the reducer for efficient processing.
- Tokenizer and parser errors and warnings are added to `logs`.
  If you want to terminate early due to errors or warnings, you can check whether there are entries in `logs` after each processing step completes.
- Processing can continue to the interpreter even if errors or warnings exist.
  However, locations where errors occurred may have been replaced with appropriate token nodes. Using this information to run the interpreter will likely cause it to behave incorrectly.
- Interpreter errors are notified via exceptions. Only warnings are logged to the `warningLogs` argument.
- Depending on the script's content, reducer processing may not finish (e.g., due to infinite loops).
  Passing an `AbortSignal` as an argument to `runReducer()` allows external interruption of execution.
