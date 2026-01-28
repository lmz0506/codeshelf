import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout";
import { ShelfPage } from "@/pages/Shelf";
import { DashboardPage } from "@/pages/Dashboard";
import { SettingsPage } from "@/pages/Settings";
import { ToastContainer, UpdateNotification } from "@/components/ui";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MainLayout>
        {(currentPage) => {
          switch (currentPage) {
            case "shelf":
              return <ShelfPage />;
            case "dashboard":
              return <DashboardPage />;
            case "settings":
              return <SettingsPage />;
            default:
              return <ShelfPage />;
          }
        }}
      </MainLayout>
      <ToastContainer />
      <UpdateNotification />
    </QueryClientProvider>
  );
}

export default App;
