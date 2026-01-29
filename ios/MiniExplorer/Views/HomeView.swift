import SwiftUI

/// Home screen matching `prototype/index.html`.
struct HomeView: View {
    @ObservedObject var model: AppModel

    @State private var goExplore = false
    @State private var goCompanion = false

#if DEBUG
    @State private var didAutoDemo = false
    private var isUIDemoEnabled: Bool {
        ProcessInfo.processInfo.environment["UI_DEMO"] == "1"
    }
#endif

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()

            VStack(spacing: 0) {
                // Safe-area top spacing similar to prototype
                Color.clear
                    .frame(height: 12)

                VStack(alignment: .leading, spacing: Theme.s16) {
                    Text("小探探")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(Theme.textSecondary)
                        .padding(.top, Theme.s16)

                    Spacer(minLength: 0)

                    VStack(spacing: Theme.s16) {
                        AIOrbView(size: .large, face: "😊", state: model.conversation)

                        Text("你好呀！")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(Theme.text)
                            .padding(.top, Theme.s8)
                    }
                    .frame(maxWidth: .infinity)

                    Spacer(minLength: 0)

                    VStack(spacing: Theme.s16) {
                        ActionCard(title: "看看这是什么", systemImage: "magnifyingglass", tint: Theme.primary) {
                            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                            goExplore = true
                        }

                        ActionCard(title: "和我聊聊天", systemImage: "message", tint: Theme.secondary) {
                            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                            goCompanion = true
                        }
                    }
                    .padding(.bottom, Theme.s24)

                    // Hidden navigation links
                    NavigationLink("", isActive: $goExplore) {
                        ExploreView(model: model)
                            .onAppear { model.applyMode(.explore) }
                    }
                    .hidden()

                    NavigationLink("", isActive: $goCompanion) {
                        CompanionView(model: model)
                            .onAppear { model.applyMode(.companion) }
                    }
                    .hidden()
                }
                .padding(.horizontal, Theme.s24)
            }
        }
        .navigationBarHidden(true)
#if DEBUG
        .task {
            // UI-only demo: Home -> Explore -> back -> Companion -> back
            // Enabled only when launched with: SIMCTL_CHILD_UI_DEMO=1
            guard isUIDemoEnabled else { return }
            guard !didAutoDemo else { return }
            didAutoDemo = true

            // Ensure recording has started before we begin transitions.
            try? await Task.sleep(nanoseconds: 1_600_000_000)

            // Enter Explore and stay long enough for visual inspection
            goExplore = true
            try? await Task.sleep(nanoseconds: 4_500_000_000)
            goExplore = false

            // Pause on Home
            try? await Task.sleep(nanoseconds: 1_200_000_000)

            // Enter Companion and stay long enough for visual inspection
            goCompanion = true
            try? await Task.sleep(nanoseconds: 4_500_000_000)
            goCompanion = false

            // End on Home
            try? await Task.sleep(nanoseconds: 800_000_000)
        }
#endif
    }
}

#Preview {
    NavigationStack {
        HomeView(model: AppModel())
    }
}
