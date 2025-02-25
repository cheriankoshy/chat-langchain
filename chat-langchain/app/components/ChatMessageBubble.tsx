import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { emojisplosion } from "emojisplosion";
import { FormEvent, useState } from "react";
import { SourceBubble, Source } from "./SourceBubble";
import {
  Flex,
  Box,
  Heading,
  HStack,
  VStack,
  Divider,
  filter,
} from "@chakra-ui/react";
import { InlineCitation } from "./InlineCitation";
import { v4 as uuidv4 } from "uuid";

export type Message = {
  id: string;
  createdAt?: Date;
  content: string;
  role: "system" | "user" | "assistant" | "function";
  runId?: string;
  sources?: Source[];
  name?: string;
  function_call?: { name: string };
};
export interface Feedback {
  feedback_id: string;
  run_id: string;
  key: string;
  score: number;
  comment?: string;
}

const filterSources = (sources: Source[]) => {
  const filtered: Source[] = [];
  const urlMap = new Map<string, number>();
  const indexMap = new Map<number, number>();
  sources.forEach((source, i) => {
    const { url } = source;
    const index = urlMap.get(url);
    if (index === undefined) {
      urlMap.set(url, i);
      indexMap.set(i, filtered.length);
      filtered.push(source);
    } else {
      indexMap.set(i, index);
    }
  });
  return { filtered, indexMap };
};

const createAnswerElements = (
  content: string,
  filteredSources: Source[],
  sourceIndexMap: Map<number, number>,
  highlighedSourceLinkStates: boolean[],
  setHighlightedSourceLinkStates: React.Dispatch<
    React.SetStateAction<boolean[]>
  >
) => {
  const matches = Array.from(content.matchAll(/\[\^?(\d+)\^?\]/g));
  const elements: JSX.Element[] = [];
  let prevIndex = 0;

  matches.forEach((match) => {
    const sourceNum = parseInt(match[1], 10);
    const resolvedNum = sourceIndexMap.get(sourceNum) ?? 10;
    if (match.index !== null && resolvedNum < filteredSources.length) {
      elements.push(
        <span
          key={`content:${prevIndex}`}
          dangerouslySetInnerHTML={{
            __html: content.slice(prevIndex, match.index),
          }}
        ></span>
      );
      elements.push(
        <InlineCitation
          key={`citation:${prevIndex}`}
          source={filteredSources[resolvedNum]}
          sourceNumber={resolvedNum}
          highlighted={highlighedSourceLinkStates[resolvedNum]}
          onMouseEnter={() =>
            setHighlightedSourceLinkStates(
              filteredSources.map((_, i) => i === resolvedNum)
            )
          }
          onMouseLeave={() =>
            setHighlightedSourceLinkStates(filteredSources.map(() => false))
          }
        />
      );
      prevIndex = (match?.index ?? 0) + match[0].length;
    }
  });
  elements.push(
    <span
      key={`content:${prevIndex}`}
      dangerouslySetInnerHTML={{ __html: content.slice(prevIndex) }}
    ></span>
  );
  return elements;
};

export function ChatMessageBubble(props: {
  message: Message;
  aiEmoji?: string;
  isMostRecent: boolean;
  messageCompleted: boolean;
  apiBaseUrl: string;
}) {
  const { role, content, runId } = props.message;
  const isUser = role === "user";

  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [comment, setComment] = useState("");
  const [feedbackColor, setFeedbackColor] = useState("");

  const cumulativeOffset = function (element: HTMLElement | null) {
    var top = 0,
      left = 0;
    do {
      top += element?.offsetTop || 0;
      left += element?.offsetLeft || 0;
      element = (element?.offsetParent as HTMLElement) || null;
    } while (element);

    return {
      top: top,
      left: left,
    };
  };

  const sendFeedback = async (score: number, key: string) => {
    let run_id = runId;
    if (run_id === undefined) {
      return;
    }
    if (isLoading) {
      return;
    }
    setIsLoading(true);
    let apiBaseUrl = props.apiBaseUrl;
    let feedback_id = feedback?.feedback_id ?? uuidv4();
    try {
      const response = await fetch(apiBaseUrl + "/feedback", {
        method: feedback?.feedback_id ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          score,
          run_id,
          key,
          feedback_id,
          comment,
        }),
      });
      const data = await response.json();
      if (data.code === 200) {
        setFeedback({ run_id, score, key, feedback_id });
        score == 1 ? animateButton("upButton") : animateButton("downButton");
        if (comment) {
          setComment("");
        }
      }
    } catch (e: any) {
      console.error("Error:", e);
      toast.error(e.message);
    }
    setIsLoading(false);
  };

  const sources = props.message.sources ?? [];
  const { filtered: filteredSources, indexMap: sourceIndexMap } =
    filterSources(sources);

  // Use an array of highlighted states as a state since React
  // complains when creating states in a loop
  const [highlighedSourceLinkStates, setHighlightedSourceLinkStates] = useState(
    filteredSources.map(() => false)
  );
  const answerElements =
    role === "assistant"
      ? createAnswerElements(
          content,
          filteredSources,
          sourceIndexMap,
          highlighedSourceLinkStates,
          setHighlightedSourceLinkStates
        )
      : [];
  const animateButton = (buttonId: string) => {
    const button = document.getElementById(buttonId);
    button!.classList.add("animate-ping");
    setTimeout(() => {
      button!.classList.remove("animate-ping");
    }, 500);

    emojisplosion({
      emojiCount: 10,
      uniqueness: 1,
      position() {
        const offset = cumulativeOffset(button);

        return {
          x: offset.left + button!.clientWidth / 2,
          y: offset.top + button!.clientHeight / 2,
        };
      },
      emojis: buttonId === "upButton" ? ["👍"] : ["👎"],
    });
  };

  return (
    <VStack align={"start"} paddingBottom={"20px"}>
      {!isUser && filteredSources.length > 0 && (
        <>
          <Flex direction={"column"} width={"100%"}>
            <VStack spacing={"5px"} align={"start"} width={"100%"}>
              <Heading
                fontSize="lg"
                fontWeight={"medium"}
                mb={1}
                color={"blue.300"}
                paddingBottom={"10px"}
              >
                Sources
              </Heading>
              <HStack spacing={"10px"} maxWidth={"100%"} overflow={"auto"}>
                {filteredSources.map((source, index) => (
                  <Box key={index} alignSelf={"stretch"} width={40}>
                    <SourceBubble
                      source={source}
                      highlighted={highlighedSourceLinkStates[index]}
                      onMouseEnter={() =>
                        setHighlightedSourceLinkStates(
                          filteredSources.map((_, i) => i === index)
                        )
                      }
                      onMouseLeave={() =>
                        setHighlightedSourceLinkStates(
                          filteredSources.map(() => false)
                        )
                      }
                    />
                  </Box>
                ))}
              </HStack>
            </VStack>
          </Flex>

          <Heading
            fontSize="lg"
            fontWeight={"medium"}
            mb={1}
            color={"blue.300"}
            paddingTop={"20px"}
          >
            Answer
          </Heading>
        </>
      )}
      {isUser ? (
        <Heading size={"lg"} fontWeight={"medium"} color={"white"}>
          {content}
        </Heading>
      ) : (
        <div className="whitespace-pre-wrap" style={{ color: "white" }}>
          {answerElements}
        </div>
      )}
      {props.message.role !== "user" &&
        props.isMostRecent &&
        props.messageCompleted && (
          <div className="relative flex space-x-1 items-start justify-start">
            <button
              className={`text-sm rounded ${
                feedback === null ? "hover:bg-green-200" : ""
              }`}
              id="upButton"
              type="button"
              onClick={() => {
                if (feedback === null && props.message.runId) {
                  sendFeedback(1, "user_score");
                  animateButton("upButton");
                  setFeedbackColor("border-4 border-green-300");
                } else {
                  toast.error("You have already provided your feedback.");
                }
              }}
            >
              👍
            </button>
            <button
              className={`text-sm rounded ${
                feedback === null ? "hover:bg-red-200" : ""
              }`}
              id="downButton"
              type="button"
              onClick={() => {
                if (feedback === null && props.message.runId) {
                  sendFeedback(0, "user_score");
                  animateButton("downButton");
                  setFeedbackColor("border-4 border-red-300");
                } else {
                  toast.error("You have already provided your feedback.");
                }
              }}
            >
              👎
            </button>
          </div>
        )}

      {!isUser && <Divider marginTop={"20px"} marginBottom={"20px"} />}
    </VStack>
  );
}
