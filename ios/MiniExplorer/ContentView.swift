//
//  ContentView.swift
//  MiniExplorer
//
//  Created by Kai Xiao on 1/27/26.
//

import SwiftUI

/// Main entry now follows prototype home (no Tab).
struct ContentView: View {
    @StateObject private var model = AppModel()

    var body: some View {
        NavigationStack {
            HomeView(model: model)
        }
        .onAppear { model.bootBasicsIfNeeded() }
    }
}

#Preview {
    ContentView()
}
