import { Providers } from './providers';
import { Router } from './providers/router';

function App() {
  return (
    <Providers>
      <Router />
    </Providers>
  );
}

export default App;
