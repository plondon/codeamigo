import {
  FileTabs,
  SandpackConsole,
  SandpackLayout,
  SandpackPreview,
  SandpackProvider,
  SandpackStack,
  useActiveCode,
  useSandpack,
} from '@codesandbox/sandpack-react';
import Editor from '@monaco-editor/react';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import gfm from 'remark-gfm';
import debounce from 'utils/debounce';

import { modalVar } from '👨‍💻apollo/cache/modal';
import Button from '👨‍💻components/Button';
import Icon from '👨‍💻components/Icon';
import { getLanguage, getModelExtension } from '👨‍💻widgets/Lesson/Editor/utils';
import PrevNext from '👨‍💻widgets/PrevNext';

import * as hal from '../../assets/hal.png';

const URN = 'urn:';

const transition = { bounce: 0.4, duration: 0.8, type: 'spring' };

const defaultLeftPanelHeight = {
  editor: 'calc(100% - 18rem)',
  instructions: '18rem',
};

type Step = {
  checkpoints: {
    message: string;
    passed: boolean;
    test: string;
  }[];
  files: {
    [key: string]: {
      code: string;
    };
  };
  instructions: string;
  start: string;
};

const steps: Step[] = [
  {
    checkpoints: [],
    files: {
      '/index.js': {
        code: "console.log('Hello World!');",
      },
      '/package.json': {
        code: '{\n  "dependencies": {},\n  "scripts": {\n    "start": "node index.js"\n  },\n  "main": "index.js",\n  "devDependencies": {}\n}',
      },
    },
    instructions:
      "## Hello Codeamigo!\nWelcome to Codeamigo. **Codeamigo uses AI** to help you learn how to code. Today, **almost 50% of code is written by AI**, so why shouldn't you _learn how to code with AI?_\n\nWe're building Codeamigo to help current and future developers learn to take advantage of the amazing tools we have at our disposal.\n\nReady to get started with a few of the basics? Let's go! Click **Next** to get started.",
    start: 'Hello World!',
  },
];

function MonacoEditor({
  currentCheckpoint,
  currentStep,
  files,
  hoverSelection,
  isStepComplete,
  leftPanelHeight,
  onReady,
  setCurrentCheckpoint,
  setCurrentStep,
  setHoverSelection,
  setIsStepComplete,
  setLeftPanelHeight,
}: {
  currentCheckpoint: number;
  currentStep: number;
  files: any;
  hoverSelection: string | null;
  isStepComplete: boolean;
  leftPanelHeight: {
    editor: string;
    instructions: string;
  };
  onReady: () => void;
  setCurrentCheckpoint: Dispatch<SetStateAction<number>>;
  setCurrentStep: Dispatch<SetStateAction<number>>;
  setHoverSelection: Dispatch<SetStateAction<string | null>>;
  setIsStepComplete: Dispatch<SetStateAction<boolean>>;
  setLeftPanelHeight: Dispatch<
    SetStateAction<{
      editor: string;
      instructions: string;
    }>
  >;
}) {
  const { code, updateCode } = useActiveCode();
  const { sandpack } = useSandpack();
  const { activeFile } = sandpack;
  const editorRef = useRef<any>();
  const monacoRef = useRef<any>();
  const [full, setFull] = useState(false);
  const isStepCompleteRef = useRef(isStepComplete);
  const [nextLoader, setNextLoader] = useState(false);

  useEffect(() => {
    isStepCompleteRef.current = isStepComplete;
  }, [isStepComplete]);

  useEffect(() => {
    setLeftPanelHeight({
      editor: full ? '100%' : 'calc(100% - 18rem)',
      instructions: full ? '0px' : '18rem',
    });
  }, [full]);

  useEffect(() => {
    setFull(false);
  }, [currentStep]);

  useEffect(() => {
    setNextLoader(false);
  }, [currentStep]);

  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor
        .getModels()
        .forEach((model: any) => model.dispose());
      setupModels();
      setupStart();
    }
  }, [currentStep]);

  useEffect(() => {
    if (!monacoRef.current) return;
    if (!editorRef.current) return;
    if (!activeFile) return;
    const model = monacoRef.current.editor.getModel(
      monacoRef.current.Uri.parse(`${URN}${activeFile}`)
    );
    if (model) editorRef.current.setModel(model);

    const language = getLanguage(activeFile);

    setupHoverProvider(language);
  }, [activeFile, monacoRef.current, editorRef.current]);

  const updatePrompt = async (value: string | undefined, ev: any) => {
    if (!value || !ev) return;
    if (isStepCompleteRef.current) return;
    const lines = value.split(/\n/);
    const lineNumber = ev.changes[0].range.startLineNumber - 1;
    const line = lines[lineNumber];
    const changePos = ev.changes[0].range.endColumn - 1;
    const insert =
      line.substring(0, changePos) + '[insert]' + line.substring(changePos);
    lines[lineNumber] = insert;
    const prompt =
      'Only respond with code that follows the instructions.\n' +
      'Instructions: ' +
      steps[currentStep].instructions +
      '\n' +
      `${
        steps[currentStep].checkpoints[currentCheckpoint]?.test
          ? '\n' +
            'Satisfy Regex: ' +
            steps[currentStep].checkpoints[currentCheckpoint]?.test
          : ''
      }` +
      lines.join('\n').split('[insert]')[0];
    const suffix = lines.join('\n').split('[insert]')[1];

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/completions`,
        {
          body: JSON.stringify({
            apiKey: localStorage.getItem('openaiKey'),
            prompt,
            suffix,
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }
      );

      const completions: { text: string }[] = await response.json();
      const suggestion = completions[0].text;
      return suggestion;
    } catch (error) {
      console.log(error);
    }
  };

  const debouncedUpdatePrompt = debounce(updatePrompt, 100);

  const testCheckpoint = (value: string) => {
    const checkpoint = steps[currentStep].checkpoints[currentCheckpoint];
    const test = checkpoint?.test;
    const regex = new RegExp(test);
    let allPassed;
    if (regex.test(value) && checkpoint && checkpoint.passed === false) {
      steps[currentStep].checkpoints[currentCheckpoint].passed = true;
      allPassed = steps[currentStep].checkpoints.every(
        (checkpoint: any) => checkpoint.passed
      );
      if (allPassed) {
        setIsStepComplete(true);
        setNextLoader(true);
      } else {
        const nextCheckpoint = steps[currentStep].checkpoints.findIndex(
          (checkpoint: any) => !checkpoint.passed
        );
        setCurrentCheckpoint(nextCheckpoint);
      }
    }

    return allPassed;
  };

  const setupModels = () => {
    Object.keys(files).forEach((mod) => {
      const model = monacoRef.current.editor.getModel(
        monacoRef.current.Uri.parse(`${URN}${mod}`)
      );
      if (model) return;
      monacoRef.current.editor.createModel(
        files[mod].code,
        getLanguage(mod || ''),
        monacoRef.current.Uri.parse(`${URN}${mod}`)
      );
    });
    const model = monacoRef.current.editor.getModel(
      monacoRef.current.Uri.parse(`${URN}${activeFile}`)
    );
    model?.updateOptions({ tabSize: 2 });
    editorRef.current.setModel(model);
  };

  const setupCompilerOptions = () => {
    const jsxFactory = 'React.createElement';
    const reactNamespace = 'React';
    const hasNativeTypescript = false;

    monacoRef.current.languages.typescript.javascriptDefaults.setEagerModelSync(
      true
    );

    const tsConfigFile = Object.keys(files).find(
      (module) => module === '/tsconfig.json'
    );
    const tsConfig = tsConfigFile
      ? JSON.parse(files[tsConfigFile].code || '')
      : undefined;

    // https://github.com/codesandbox/codesandbox-client/blob/master/packages/app/src/embed/components/Content/Monaco/index.js
    monacoRef.current.languages.typescript.typescriptDefaults.setCompilerOptions(
      {
        allowJs: true,
        allowNonTsExtensions: !hasNativeTypescript,
        experimentalDecorators: true,
        jsx: tsConfig?.compilerOptions
          ? tsConfig?.compilerOptions.jsx
          : monacoRef.current.languages.typescript.JsxEmit.React,
        jsxFactory,
        module: hasNativeTypescript
          ? monacoRef.current.languages.typescript.ModuleKind.ES2015
          : monacoRef.current.languages.typescript.ModuleKind.System,
        moduleResolution:
          monacoRef.current.languages.typescript.ModuleResolutionKind.NodeJs,
        // forceConsistentCasingInFileNames:
        //   hasNativeTypescript && existingConfig.forceConsistentCasingInFileNames,
        // noImplicitReturns:
        //   hasNativeTypescript && existingConfig.noImplicitReturns,
        // noImplicitThis: hasNativeTypescript && existingConfig.noImplicitThis,
        // noImplicitAny: hasNativeTypescript && existingConfig.noImplicitAny,
        // strictNullChecks: hasNativeTypescript && existingConfig.strictNullChecks,
        // suppressImplicitAnyIndexErrors:
        //   hasNativeTypescript && existingConfig.suppressImplicitAnyIndexErrors,
        // noUnusedLocals: hasNativeTypescript && existingConfig.noUnusedLocals,
        newLine: monacoRef.current.languages.typescript.NewLineKind.LineFeed,

        noEmit: true,

        reactNamespace,

        target: monacoRef.current.languages.typescript.ScriptTarget.ES2016,

        typeRoots: [`node_modules/@types`],
      }
    );
  };

  const setupStart = () => {
    const match = editorRef.current
      .getModel()
      .findMatches(steps[currentStep].start, true, false, false, null, true)[0];

    if (!match) return;
    editorRef.current.setPosition(match.range.getEndPosition());
    editorRef.current.focus();
  };

  class InlineCompleter {
    async provideInlineCompletions() {
      const range = {
        endColumn: editorRef.current.getPosition().column,
        endLineNumber: editorRef.current.getPosition().lineNumber,
        startColumn: editorRef.current.getPosition().column,
        startLineNumber: editorRef.current.getPosition().lineNumber,
      };
      const suggestion = await debouncedUpdatePrompt(
        editorRef.current.getValue(),
        {
          changes: [
            {
              range,
            },
          ],
        }
      );

      if (!suggestion) return;

      return {
        items: [
          {
            insertText: suggestion,
            range,
          },
        ],
      };
    }
    freeInlineCompletions() {}
  }

  const setupInlineCompletions = () => {
    monacoRef.current.languages.registerInlineCompletionsProvider(
      { pattern: '**' },
      new InlineCompleter()
    );
  };

  const setupHoverProvider = (language: string) => {
    monacoRef.current.languages.registerHoverProvider(language, {
      provideHover: async (model: any, position: any) => {
        const selection = editorRef.current.getSelection();
        const selectionValue = model.getValueInRange(selection);
        const wordAtPosition = model.getWordAtPosition(position);
        const { word } = wordAtPosition || {};
        const isWordInSelection =
          word &&
          selection.containsPosition({
            column: position.column,
            lineNumber: position.lineNumber,
          });

        let nextHoverSelection = null;
        if (word && !isWordInSelection) {
          nextHoverSelection = word;
        } else if (selectionValue) {
          nextHoverSelection = selectionValue;
        }

        if (nextHoverSelection === hoverSelection) return;
        setHoverSelection(nextHoverSelection);
      },
    });
  };

  const handleMount = (editor: any, monaco: any) => {
    if (monacoRef.current) return;
    monacoRef.current = monaco;
    editorRef.current = editor;

    setupInlineCompletions();
    setupCompilerOptions();
    setupModels();
    setupStart();
    onReady();
  };

  const extension = getModelExtension(activeFile);
  const isImage =
    extension === 'jpg' ||
    extension === 'png' ||
    extension === 'gif' ||
    extension === 'svg' ||
    extension === 'jpeg';

  return (
    <SandpackStack
      className="relative z-30 transition-all"
      style={{ height: `${leftPanelHeight.editor}`, margin: 0 }}
    >
      <Checkpoints currentStep={currentStep} />
      <PrevNext
        currentStep={currentStep}
        disabled={!isStepComplete}
        nextLoader={nextLoader}
        setCurrentStep={setCurrentStep}
        steps={steps.length}
      />
      <FileTabs />
      <div
        className={`flex h-full w-full items-center justify-center ${
          isImage ? 'block' : 'hidden'
        }`}
      >
        <img className="w-1/2" src={sandpack.files[activeFile].code} />
      </div>
      <div className={`h-[320px] sm:h-full ${isImage ? 'hidden' : 'block'}`}>
        <Editor
          defaultValue={code}
          language="javascript"
          onChange={(value) => {
            testCheckpoint(value || '');
            updateCode(value || '');
          }}
          onMount={handleMount}
          options={{
            fontSize: 14,
            fontWeight: 600,
            lineNumbers: 'off',
            minimap: {
              enabled: false,
            },
            quickSuggestions: false,
            wordWrap: 'on',
          }}
          theme="vs-dark"
          width="100%"
        />
      </div>
      <Icon
        className="absolute bottom-0 right-0 m-2 text-neutral-400 hover:text-white"
        name={full ? 'resize-small' : 'resize-full'}
        onClick={() => setFull(!full)}
      />
    </SandpackStack>
  );
}

const Markdown = ({
  currentStep,
  leftPanelHeight,
  setLeftPanelHeight,
}: {
  currentStep: number;
  leftPanelHeight: {
    editor: string;
    instructions: string;
  };
  setLeftPanelHeight: Dispatch<
    SetStateAction<{
      editor: string;
      instructions: string;
    }>
  >;
}) => {
  const [full, setFull] = useState(false);

  useEffect(() => {
    setFull(false);
  }, [currentStep]);

  useEffect(() => {
    setLeftPanelHeight({
      editor: full ? '0px' : 'calc(100% - 18rem)',
      instructions: full ? '100%' : '18rem',
    });
  }, [full]);

  return (
    <div
      className={`relative overflow-hidden bg-neutral-900 transition-all ${
        full ? 'z-40' : 'z-20'
      }`}
      key={currentStep}
      style={{ height: `${leftPanelHeight.instructions}` }}
    >
      <ReactMarkdown
        children={steps[currentStep].instructions}
        className="markdown-body h-full overflow-scroll border-b border-neutral-800 py-2 px-3"
        plugins={[gfm]}
      />
      <Icon
        className="absolute bottom-0 right-0 m-2 text-neutral-400 hover:text-white"
        name={full ? 'resize-small' : 'resize-full'}
        onClick={() => setFull(!full)}
      />
    </div>
  );
};

const Checkpoints = ({ currentStep }: { currentStep: number }) => {
  return (
    <div>
      {steps[currentStep].checkpoints?.map((checkpoint) => {
        return (
          <div
            className="relative z-20 flex items-center gap-2 border-b border-neutral-800 bg-black p-2 px-3"
            key={checkpoint.message}
          >
            <div
              className={`flex h-4 min-h-[1rem] w-4 min-w-[1rem] items-center justify-center rounded-full border ${
                checkpoint.passed
                  ? 'border-green-500 bg-green-900'
                  : 'border-neutral-500 bg-black'
              }`}
            >
              <Icon
                className={`text-xxs ${
                  checkpoint.passed ? `text-green-500` : 'text-neutral-500'
                }`}
                // @ts-ignore
                name={checkpoint.passed ? 'check' : ''}
              />
            </div>
            <pre className="whitespace-normal text-white">
              {checkpoint.message}
            </pre>
          </div>
        );
      })}
    </div>
  );
};

const ChatBot = ({ hoverSelection }: { hoverSelection: string | null }) => {
  // expand textarea height on enter
  const [height, setHeight] = useState(0);
  const { code } = useActiveCode();
  const [response, setResponse] = useState('');
  const [streamTextIndex, setStreamTextIndex] = useState(0);
  const [streamedTexts, setStreamedTexts] = useState<string[][]>([]);
  const streamedTextsRef = useRef();

  useEffect(() => {
    if (!response) return;
    if (!hoverSelection) return;
    setStreamTextIndex((prev) => prev + 1);
    streamText();
  }, [response]);

  useEffect(() => {
    if (streamedTextsRef.current) {
      // scroll to bottom
      const element = streamedTextsRef.current;
      console.log(element.scrollHeight);
      element.scrollTop = element.scrollHeight;
    }
  }, [streamedTexts]);

  useEffect(() => {
    if (hoverSelection) {
      const run = async () => {
        const prompt = `${code} """ In the above code explain what ${hoverSelection} is doing to a total beginner.}`;
        if (hoverSelection) {
          try {
            const response = await fetch(
              `${process.env.NEXT_PUBLIC_API_URL}/explain`,
              {
                body: JSON.stringify({
                  apiKey: localStorage.getItem('openaiKey'),
                  hoverSelection,
                  prompt,
                }),
                headers: {
                  'Content-Type': 'application/json',
                },
                method: 'POST',
              }
            );

            const explainations: { text: string }[] = await response.json();
            const value = `${explainations[0].text}`;
            setResponse(value);
          } catch (error) {
            console.log(error);
          }
        }
      };

      run();
    }
  }, [hoverSelection]);

  const handleKeyDown = (e: any) => {
    if (e.key === 'Enter' || e.key === 'Backspace') {
      setHeight(e.target.scrollHeight);
    }
  };

  const streamText = () => {
    let index = 0;
    const intervalId = setInterval(() => {
      setStreamedTexts((prev) => {
        const newStream = [...prev];
        if (!newStream[streamTextIndex]) newStream.push([]);
        newStream[streamTextIndex].push(response[index]);
        return newStream;
      });
      index++;
      if (index === response.length) clearInterval(intervalId);
    }, 50);
  };

  return (
    <div
      className={`flex max-h-[50%] flex-col border-t border-neutral-800 bg-black`}
    >
      <div className="h-full overflow-scroll" ref={streamedTextsRef}>
        <div className="sticky top-0 bg-black px-4 py-2">
          <div className="mb-1 flex items-center gap-2">
            <Image height={24} src={hal} width={24} />
            <pre className="whitespace-normal text-white">
              Hello, I'm Codeamigo. I'm here to help you with this tutorial.
            </pre>
          </div>
          <div className="w-full rounded-lg border border-neutral-800 bg-neutral-900 p-2">
            <textarea
              className="min-h-[40px] w-full rounded-md border border-neutral-800 bg-black py-2 px-3 text-sm text-white !outline-0 !ring-0 transition-all placeholder:text-neutral-400 focus:border-neutral-700"
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything, or hover over some code to see what I can do."
              style={{ height: `${height}px` }}
            />
          </div>
        </div>
        {streamedTexts.length ? (
          <div className="flex flex-col bg-black">
            {streamedTexts.map((text, index) => {
              if (text.length === 0) return null;
              return (
                <div
                  className={`px-4 py-2 text-sm ${
                    index % 2 === 0 ? 'bg-neutral-900' : 'bg-black'
                  }`}
                  key={text.join('')}
                >
                  {text.map((char, index) => {
                    return <span key={`${char}-${index}`}>{char}</span>;
                  })}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
};

const V2 = () => {
  const [ready, setReady] = useState(false);
  const [loaderReady, setLoaderReady] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [currentCheckpoint, setCurrentCheckpoint] = useState(0);
  const [leftPanelHeight, setLeftPanelHeight] = useState(
    defaultLeftPanelHeight
  );
  const [isStepComplete, setIsStepComplete] = useState(false);
  const [hoverSelection, setHoverSelection] = useState<string | null>(null);

  // HIGH DEMAND
  useEffect(() => {
    if (!localStorage.getItem('openaiKey')) {
      modalVar({
        callback: () => null,
        name: 'highDemand',
      });
    }
  }, []);

  useEffect(() => {
    setLeftPanelHeight(defaultLeftPanelHeight);
  }, [currentStep]);

  useEffect(() => {
    const allPassed =
      steps[currentStep].checkpoints.every((checkpoint) => checkpoint.passed) ||
      !steps[currentStep].checkpoints.length;
    setIsStepComplete(allPassed);
  }, [currentStep]);

  useEffect(() => {
    const nextCheckpoint = steps[currentStep].checkpoints.findIndex(
      (checkpoint) => {
        return !checkpoint.passed;
      }
    );
    if (nextCheckpoint !== -1) {
      setCurrentCheckpoint(nextCheckpoint);
    }
  }, [currentStep]);

  useEffect(() => {
    let timeout: any;
    if (loaderReady && editorReady) {
      timeout = setTimeout(() => {
        setReady(true);
      }, 1000);
    }

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [editorReady, loaderReady]);

  return (
    <AnimatePresence>
      <motion.div
        animate={ready ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
        className="flex w-full flex-col items-center justify-center gap-3 p-5 md:h-full"
        initial={{ opacity: 0, scale: 0 }}
        key="v2"
        style={{ transformOrigin: 'center' }}
        transition={transition}
      >
        <div
          className="h-full overflow-hidden rounded-lg border border-neutral-800"
          style={{ width: '100%' }}
        >
          <SandpackProvider
            files={steps[currentStep].files}
            template="vanilla"
            theme={'dark'}
          >
            <SandpackLayout>
              <SandpackStack className="editor-instructions-container !h-full">
                <Markdown
                  currentStep={currentStep}
                  leftPanelHeight={leftPanelHeight}
                  setLeftPanelHeight={setLeftPanelHeight}
                />
                <MonacoEditor
                  currentCheckpoint={currentCheckpoint}
                  currentStep={currentStep}
                  files={steps[currentStep].files}
                  hoverSelection={hoverSelection}
                  isStepComplete={isStepComplete}
                  leftPanelHeight={leftPanelHeight}
                  onReady={() => setEditorReady(true)}
                  setCurrentCheckpoint={setCurrentCheckpoint}
                  setCurrentStep={setCurrentStep}
                  setHoverSelection={setHoverSelection}
                  setIsStepComplete={setIsStepComplete}
                  setLeftPanelHeight={setLeftPanelHeight}
                />
              </SandpackStack>
              <SandpackStack className="!h-full">
                <SandpackPreview className="!h-0" />
                <SandpackConsole className="overflow-scroll" />
                <ChatBot hoverSelection={hoverSelection} />
              </SandpackStack>
            </SandpackLayout>
          </SandpackProvider>
        </div>
      </motion.div>
      <motion.div
        animate={
          ready || !loaderReady
            ? { opacity: 0, scale: 0 }
            : { opacity: 1, scale: 1 }
        }
        className="fixed top-0 left-0 flex h-full w-full animate-pulse items-center justify-center text-white"
        initial={{ opacity: 0.5, scale: 0.5 }}
        style={{ transformOrigin: 'center' }}
        transition={transition}
      >
        <Image
          height={60}
          onLoad={() => setLoaderReady(true)}
          src={hal}
          width={60}
        />
        {/* <span className="absolute flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F9D154] opacity-75"></span>
        </span> */}
      </motion.div>
    </AnimatePresence>
  );
};

export default V2;
