import Text "mo:core/Text";
import Time "mo:core/Time";
import Nat "mo:core/Nat";
import Outcall "./http-outcalls/outcall";

actor {
  public type HistoryEntry = {
    id : Nat;
    docType : Text;
    prompt : Text;
    additionalContent : Text;
    generatedContent : Text;
    timestamp : Int;
  };

  var history : [HistoryEntry] = [];
  var nextId : Nat = 0;

  public query func transform(input : Outcall.TransformationInput) : async Outcall.TransformationOutput {
    Outcall.transform(input);
  };

  public func generateDocument(docType : Text, prompt : Text, additionalContent : Text, outputFormat : Text) : async Text {
    let formatInstruction = switch (outputFormat) {
      case ("Markdown") "Format the output using Markdown (headers, bold, lists, etc).";
      case ("Formal / Structured") "Format the output as a formal structured document with clear sections and headings.";
      case ("Bullet Points") "Format the output primarily using bullet points and short sections.";
      case _ "Format the output as clean plain text.";
    };

    let systemContent = "You are a professional document writer. Generate well-structured, formal documents based on the user specifications. Format the document appropriately for its type, including proper headings, sections, and professional language. Output only the document content itself, no explanations.";
    let userContent = "Document Type: " # docType # ". Instructions: " # prompt # ". Additional Content: " # additionalContent # ". " # formatInstruction;

    let escapedSystem = systemContent.replace(#text "\"", "\\\"");
    let escapedUser = userContent.replace(#text "\"", "\\\"");
    let escapedUser2 = escapedUser.replace(#text "\n", " ");

    let body = "{\"model\":\"openai\",\"messages\":[{\"role\":\"system\",\"content\":\"" # escapedSystem # "\"},{\"role\":\"user\",\"content\":\"" # escapedUser2 # "\"}]}";

    let result = await Outcall.httpPostRequest(
      "https://text.pollinations.ai/",
      [{ name = "Content-Type"; value = "application/json" }],
      body,
      transform,
    );

    // Save to history
    let entry : HistoryEntry = {
      id = nextId;
      docType = docType;
      prompt = prompt;
      additionalContent = additionalContent;
      generatedContent = result;
      timestamp = Time.now();
    };
    history := history.concat([entry]);
    nextId := nextId + 1;

    result;
  };

  public func saveDocument(docType : Text, prompt : Text, additionalContent : Text, generatedContent : Text) : async Nat {
    let entry : HistoryEntry = {
      id = nextId;
      docType = docType;
      prompt = prompt;
      additionalContent = additionalContent;
      generatedContent = generatedContent;
      timestamp = Time.now();
    };
    history := history.concat([entry]);
    let id = nextId;
    nextId := nextId + 1;
    id;
  };

  public query func getHistory() : async [HistoryEntry] {
    history;
  };

  public func clearHistory() : async () {
    history := [];
  };

  public func deleteEntry(id : Nat) : async () {
    history := history.filter(func(e : HistoryEntry) : Bool { e.id != id });
  };
};
