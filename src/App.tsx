import { usePulse } from "./hooks/usePulse";
import Sidebar from "./components/Sidebar";
import RequestPanel from "./components/RequestPanel";
import ResponsePanel from "./components/ResponsePanel";

export default function App() {
  const state = usePulse();

  return (
    <div className="h-screen flex overflow-hidden bg-pulse-deepest">
      <Sidebar
        collections={state.collections}
        history={state.history}
        activeTab={state.sidebarTab}
        onTabChange={state.setSidebarTab}
        onLoadHistory={state.loadFromHistory}
        onLoadRequest={state.loadCollectionRequest}
      />

      <main className="flex-1 flex flex-col min-w-0">
        <RequestPanel
          method={state.method}
          onMethodChange={state.setMethod}
          url={state.url}
          onUrlChange={state.setUrl}
          headers={state.headers}
          onAddHeader={state.addHeader}
          onUpdateHeader={state.updateHeader}
          onRemoveHeader={state.removeHeader}
          body={state.body}
          onBodyChange={state.setBody}
          contentType={state.contentType}
          onContentTypeChange={state.setContentType}
          requestTab={state.requestTab}
          onRequestTabChange={state.setRequestTab}
          isLoading={state.isLoading}
          onSend={state.sendRequest}
        />

        <div className="flex-1 min-h-0 border-t border-pulse-border">
          <ResponsePanel
            response={state.response}
            isLoading={state.isLoading}
            error={state.error}
            responseTab={state.responseTab}
            onResponseTabChange={state.setResponseTab}
          />
        </div>
      </main>
    </div>
  );
}
